import type { NsgLog, NsgProgress, NsgSource } from "../model";
import { NSG_MAGIC } from "./container";
import { QUALCOMM_DIAG_PREFIX_BYTES, type QualcommDiagPrefix, readDiagPrefix } from "./qualcomm/diag";
import { classifyQualcommRecord } from "./qualcomm/record";
import { type RecordContext, RecordingBuilder, type RecordingOptions } from "./recordingBuilder";

const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;

type Phase = "magic" | "xmlLength" | "xml" | "header" | "prefix" | "qualcommPrefix" | "payload" | "truncatedTail";

export class StreamDecoder {
  private phase: Phase = "magic";
  private offset = 0;
  private varintValue = 0;
  private varintFactor = 1;
  private varintBytes = 0;
  private frame: number[] = [];
  private frameOffset = 0;
  private remaining = 0;
  private payload: Uint8Array | null = null;
  private payloadPosition = 0;
  private readonly qualcommPrefix = new Uint8Array(QUALCOMM_DIAG_PREFIX_BYTES);
  private qualcommPrefixPosition = 0;
  private signalingValidationPrefix: QualcommDiagPrefix | null = null;
  private marker: number | null = null;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly expectedDecodedSize: number | null;
  private readonly allowIncompleteFinalRecord: boolean;
  private readonly recording: RecordingBuilder;

  constructor(source: NsgSource, options: RecordingOptions = {}) {
    if (!Number.isSafeInteger(source.size) || source.size < 0) throw new Error("Invalid NSG file size.");
    this.expectedDecodedSize = source.decodedSize === undefined ? source.size : source.decodedSize;
    if (this.expectedDecodedSize !== null && (!Number.isSafeInteger(this.expectedDecodedSize) || this.expectedDecodedSize < 0))
      throw new Error("Invalid decoded NSG file size.");
    this.allowIncompleteFinalRecord = options.allowIncompleteFinalRecord ?? false;
    this.recording = new RecordingBuilder(source, options, this.decoder, (message) => this.fail(message));
  }

  push(chunk: Uint8Array): void {
    if (this.recording.isFinished) this.fail("Cannot append to a finished NSG log");
    if (this.expectedDecodedSize !== null && chunk.length > this.expectedDecodedSize - this.offset)
      this.fail("NSG stream exceeds the declared file size");
    let position = 0;
    while (position < chunk.length) {
      if (this.phase === "magic") {
        if (chunk[position++] !== NSG_MAGIC[this.offset++]) this.fail("Expected an NSG !NSG log; CLF, DLF and QMDL are not supported here");
        if (this.offset === NSG_MAGIC.length) this.phase = "xmlLength";
        continue;
      }

      if (this.phase === "xmlLength" || this.phase === "header") {
        const byte = chunk[position++];
        this.offset++;
        this.varintBytes++;
        this.varintValue += (byte & 0x7f) * this.varintFactor;
        if (!Number.isSafeInteger(this.varintValue) || this.varintBytes > 10) this.fail("Unsupported NSG integer larger than the safe integer range");
        if (byte >= 0x80) {
          if (this.varintBytes === 10) this.fail("Unterminated NSG ULEB128 integer");
          this.varintFactor *= 128;
          continue;
        }
        const value = this.varintValue;
        this.varintValue = 0;
        this.varintFactor = 1;
        this.varintBytes = 0;
        if (this.phase === "xmlLength") {
          if (value === 0 || value > MAX_HEADER_BYTES || (this.expectedDecodedSize !== null && value > this.expectedDecodedSize - this.offset))
            this.fail("Invalid or unsupported NSG XML header length");
          this.payload = new Uint8Array(value);
          this.payloadPosition = 0;
          this.remaining = value;
          this.phase = "xml";
        } else {
          this.frame.push(value);
          if (this.frame.length === 6) this.beginPayload();
        }
        continue;
      }

      if (this.phase === "prefix") {
        this.marker = chunk[position++];
        this.offset++;
        this.remaining--;
        if (this.marker >= 0x40 && this.marker <= 0x44) {
          if (this.remaining > MAX_JSON_BYTES) this.fail("A decoded NSG event exceeds the 16 MiB limit");
          this.payload = new Uint8Array(this.remaining);
          this.payloadPosition = 0;
        }
        this.phase = "payload";
        if (this.remaining === 0) this.completePayload();
        continue;
      }

      if (this.phase === "qualcommPrefix") {
        const length = Math.min(this.remaining, QUALCOMM_DIAG_PREFIX_BYTES - this.qualcommPrefixPosition, chunk.length - position);
        this.qualcommPrefix.set(chunk.subarray(position, position + length), this.qualcommPrefixPosition);
        this.qualcommPrefixPosition += length;
        position += length;
        this.offset += length;
        this.remaining -= length;
        if (this.qualcommPrefixPosition < QUALCOMM_DIAG_PREFIX_BYTES) continue;

        const payloadLength = this.remaining + QUALCOMM_DIAG_PREFIX_BYTES;
        const prefix = readDiagPrefix(this.qualcommPrefix);
        if (prefix === null) this.fail("Invalid Qualcomm DIAG prefix");
        const capture = this.recording.selectQualcommPayloadCapture(classifyQualcommRecord(prefix, payloadLength), prefix);
        if (capture !== null) {
          this.payload = new Uint8Array(capture.byteLength);
          this.payload.set(this.qualcommPrefix);
          this.payloadPosition = QUALCOMM_DIAG_PREFIX_BYTES;
          this.signalingValidationPrefix = capture.validationPrefix;
        }
        this.phase = "payload";
        if (this.remaining === 0) this.completePayload();
        continue;
      }

      if (this.phase === "truncatedTail") {
        const length = Math.min(this.remaining, chunk.length - position);
        position += length;
        this.offset += length;
        this.remaining -= length;
        continue;
      }

      const length = Math.min(this.remaining, chunk.length - position);
      if (this.payload !== null) {
        const retainedLength = Math.min(length, this.payload.length - this.payloadPosition);
        if (retainedLength > 0) {
          this.payload.set(chunk.subarray(position, position + retainedLength), this.payloadPosition);
          this.payloadPosition += retainedLength;
        }
      }
      position += length;
      this.offset += length;
      this.remaining -= length;
      if (this.remaining > 0) continue;
      if (this.phase === "xml") {
        try {
          this.recording.setHeaderXml(this.decoder.decode(this.payload!));
        } catch {
          this.fail("Invalid UTF-8 in the NSG XML header");
        }
        this.payload = null;
        this.phase = "header";
        this.frameOffset = this.offset;
      } else this.completePayload();
    }
  }

  progress(): NsgProgress {
    return this.recording.progress(this.offset);
  }

  finish(): NsgLog {
    if (this.recording.isFinished) return this.recording.finish();
    if (this.allowIncompleteFinalRecord && this.hasIncompleteFinalRecord()) this.discardIncompleteFinalRecord();
    if (
      (this.expectedDecodedSize !== null && this.offset !== this.expectedDecodedSize) ||
      (this.phase !== "header" && this.phase !== "truncatedTail") ||
      this.frame.length !== 0 ||
      this.varintBytes !== 0
    )
      this.fail("Truncated NSG log");
    return this.recording.finish();
  }

  private fail(message: string): never {
    throw new Error(`${message} (byte ${this.offset}).`);
  }

  private beginPayload(): void {
    const [, , elapsedUs, recordType, , length] = this.frame;
    if (recordType === 0) this.recording.validateTimeAnchor(elapsedUs, length);
    if (this.expectedDecodedSize !== null && length > this.expectedDecodedSize - this.offset) {
      if (!this.allowIncompleteFinalRecord) this.fail("Truncated NSG record payload");
      this.remaining = this.expectedDecodedSize - this.offset;
      this.phase = "truncatedTail";
      this.recording.markInputTruncated();
      this.frame.length = 0;
      return;
    }
    this.remaining = length;
    this.payload = null;
    this.payloadPosition = 0;
    this.signalingValidationPrefix = null;
    this.marker = null;
    this.phase = "payload";
    if (recordType === 0) {
      this.payload = new Uint8Array(8);
    } else if (recordType === 53 && length > 0) this.phase = "prefix";
    else if (recordType === 16 && length >= QUALCOMM_DIAG_PREFIX_BYTES) {
      this.qualcommPrefixPosition = 0;
      this.phase = "qualcommPrefix";
    }
    if (length === 0) this.completePayload();
  }

  private completePayload(): void {
    const recordType = this.frame[3];
    this.recording.observeRecord(this.frame[2], recordType);
    if (recordType === 0) this.recording.setTimeAnchor(this.payload!);
    else if (recordType === 16 && this.payload !== null)
      this.recording.recordQualcommPayload(this.payload, this.recordContext(), this.signalingValidationPrefix);
    else if (this.payload !== null && this.marker !== null) this.recording.recordEvent(this.payload, this.marker, this.recordContext());
    this.payload = null;
    this.frame.length = 0;
    this.phase = "header";
    this.frameOffset = this.offset;
  }

  private recordContext(): RecordContext {
    return {
      recordOffset: this.frameOffset,
      streamIndex: this.frame[1],
      elapsedUs: this.frame[2],
    };
  }

  private discardIncompleteFinalRecord(): void {
    this.recording.markInputTruncated();
    this.payload = null;
    this.frame.length = 0;
    this.varintValue = 0;
    this.varintFactor = 1;
    this.varintBytes = 0;
    this.remaining = 0;
    this.phase = "header";
  }

  private hasIncompleteFinalRecord(): boolean {
    if (this.expectedDecodedSize !== null && this.offset !== this.expectedDecodedSize) return false;
    if (this.phase === "header") return this.frame.length > 0 || this.varintBytes > 0;
    return this.expectedDecodedSize === null && this.frame.length === 6 && ["prefix", "qualcommPrefix", "payload"].includes(this.phase);
  }
}
