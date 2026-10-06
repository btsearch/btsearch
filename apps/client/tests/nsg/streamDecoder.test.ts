import assert from "node:assert/strict";
import test from "node:test";

import { formatNsgTimestamp } from "../../src/lib/nsg-parser";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import type { NsgJsonObject } from "../../src/lib/nsg-parser/model";
import { QUALCOMM_LTE_RRC_OTA_LOG_CODE, QUALCOMM_NR_RRC_OTA_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { concatBytes as concat, bytesFromHex as fromHex, encodeVarint as varint } from "./binary";
import {
  B97F_ONE_CELL,
  EPOCH_US,
  LTE_RRC_V30,
  NR_RRC_V26,
  frame,
  jsonEvent,
  lteEvent,
  mixedRecordingBytes,
  nsgHeader,
  timeAnchor,
} from "./fixtures/nsgContainer";

const encoder = new TextEncoder();

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

void test("decodes all binary boundaries, exact timestamps, SIM context, zero values and unknown fields", () => {
  const bytes = mixedRecordingBytes();
  const expected = parseRecording(bytes);
  for (const chunkSize of [1, 2, 3, 7, 16, 31, 64]) assert.deepEqual(parseRecording(bytes, chunkSize), expected);
  assert.equal(expected.recordCount, 6);
  assert.deepEqual(expected.recordTypeCounts, { "0": 1, "16": 1, "53": 4 });
  assert.equal(expected.events.length, 3);
  assert.equal(expected.cells.length, 3);
  assert.equal(expected.servingCellCount, 1);
  assert.equal(expected.timeRegressions, 1);
  assert.equal(expected.startTimestampUs, EPOCH_US.toString());
  const cell = expected.cells[0];
  assert.equal(cell.timestampUs, (EPOCH_US + 1234567n).toString());
  assert.equal(formatNsgTimestamp(cell.timestampUs), "2026-09-05T13:14:19.451374Z");
  assert.equal(cell.mnc, "03");
  assert.equal(cell.eci, 0);
  assert.equal(cell.sinr, 0);
  assert.equal(cell.ta, 0);
  assert.equal(cell.slotId, 0);
  assert.equal(cell.isDefaultSubscription, false);
  assert.equal(expected.events[0].data.default, false);
  assert.equal(cell.raw.extra, "Zażółć, test");
  assert.equal(expected.cells[1].registered, false);
  assert.equal(expected.cells[2].registered, null);
  assert.equal(expected.cells[2].rsrp, 2147483647);
  assert.strictEqual(cell.raw, (expected.events[0].data.cells as NsgJsonObject[])[0]);
});

void test("streams a Qualcomm type-16 prefix across every chunk boundary", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const measurement = frame(16, 900_000, B97F_ONE_CELL);
  const bytes = concat(initial, measurement, lteEvent(1_000_000));
  const prefixStart = initial.length + measurement.length - B97F_ONE_CELL.length;

  for (let prefixBytes = 1; prefixBytes < 4; prefixBytes++) {
    const parser = new StreamDecoder({ name: "chunked-qualcomm.log", size: bytes.length });
    parser.push(bytes.subarray(0, prefixStart + prefixBytes));
    parser.push(bytes.subarray(prefixStart + prefixBytes));
    const nr = parser.finish().cells.filter((cell) => cell.rat === "NR");
    assert.equal(nr.length, 1);
    assert.equal(nr[0].pci, 947);
    assert.equal(nr[0].arfcn, 649920);
  }
});

void test("streams LTE v30 and NR v26 signaling across chunk boundaries", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const bytes = concat(initial, frame(16, 321_000, LTE_RRC_V30, 1), frame(16, 654_000, NR_RRC_V26, 0));
  const expected = parseRecording(bytes);
  for (const chunkSize of [1, 2, 3, 7, 16, 31, 47]) assert.deepEqual(parseRecording(bytes, chunkSize), expected);

  assert.equal(expected.signalingRecordCount, 2);
  assert.equal(expected.signalingTruncated, false);
  assert.equal(expected.inputTruncated, false);
  assert.equal(expected.signaling.length, 2);
  assert.deepEqual(
    expected.signaling.map((record) => ({
      streamIndex: record.streamIndex,
      logCode: record.logCode,
      version: record.version,
      pduId: record.pduId,
      channel: record.channel,
      pduType: record.pduType,
      payload: record.payload,
    })),
    [
      {
        streamIndex: 1,
        logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE,
        version: "30",
        pduId: 7,
        channel: "PCCH",
        pduType: null,
        payload: fromHex("40005e779a0780"),
      },
      {
        streamIndex: 0,
        logCode: QUALCOMM_NR_RRC_OTA_LOG_CODE,
        version: "26",
        pduId: 36,
        channel: null,
        pduType: "nr-RadioBearerConfig",
        payload: fromHex("1009288e9026"),
      },
    ],
  );
  assert.deepEqual(structuredClone(expected).signaling, expected.signaling);
});

void test("reports event decoding failures at the exact stream byte offset", () => {
  const bytes = concat(nsgHeader(), timeAnchor(), frame(53, 1, Uint8Array.of(0x42, 0xff)));
  const parser = new StreamDecoder({ name: "invalid-event.log", size: bytes.length });
  assert.throws(
    () => parser.push(bytes),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `Invalid UTF-8 or JSON in a decoded NSG event (byte ${bytes.length}).`);
      return true;
    },
  );
});

void test("skips a 70 MiB opaque payload incrementally without treating it as JSON", () => {
  const length = 70 * 1024 * 1024;
  const initial = concat(nsgHeader(), timeAnchor(), varint(0), varint(0), varint(1), varint(16), varint(0), varint(length));
  const final = jsonEvent(2, { event: "screen", state: "on" });
  const parser = new StreamDecoder({ name: "large.log", size: initial.length + length + final.length });
  parser.push(initial);
  const chunk = new Uint8Array(64 * 1024).fill(0x42);
  for (let remaining = length; remaining > 0; remaining -= chunk.length) parser.push(chunk.subarray(0, Math.min(remaining, chunk.length)));
  parser.push(final);
  const log = parser.finish();
  assert.equal(log.recordCount, 3);
  assert.equal(log.events.length, 1);
  assert.equal(log.events[0].name, "screen");
  assert.ok(log.recognizedPayloadBytes < 100);
});

void test("streams beyond 8 GiB with exact offsets and one reused 1 MiB buffer", (context) => {
  const opaqueLength = 8 * 1024 ** 3 + 257;
  const initial = concat(nsgHeader(), timeAnchor(), varint(0), varint(0), varint(1), varint(16), varint(0), varint(opaqueLength));
  const final = jsonEvent(2, { event: "ScheduleCellInfo", cells: [{ type: "lte", registered: true, dbm: -90 }] });
  const size = initial.length + opaqueLength + final.length;
  const parser = new StreamDecoder({ name: "over-eight-gib.log", size });
  parser.push(initial);
  const chunk = new Uint8Array(1024 * 1024);
  let crossedFourGiB = false;
  for (let remaining = opaqueLength; remaining > 0; remaining -= chunk.length) {
    parser.push(chunk.subarray(0, Math.min(remaining, chunk.length)));
    const progress = parser.progress();
    if (progress.bytesRead >= 4 * 1024 ** 3) crossedFourGiB = true;
    assert.ok(progress.bytesRead <= size);
  }
  parser.push(final);
  const log = parser.finish();
  assert.equal(crossedFourGiB, true);
  assert.ok(log.sourceBytes > 8 * 1024 ** 3);
  assert.equal(log.sourceBytes, size);
  assert.equal(log.recordCount, 3);
  assert.equal(log.cells.length, 1);
  assert.equal(log.cells[0].recordOffset, initial.length + opaqueLength);
  assert.equal(log.cells[0].dbm, -90);
  assert.equal(log.cells[0].timestampUs, (EPOCH_US + 2n).toString());
  assert.equal(log.cells[0].elapsedUs, 2);
  assert.equal(parser.progress().bytesRead, size);
  assert.equal(parser.progress().percent, 100);
  context.diagnostic(`${size} logical input bytes; ${chunk.byteLength} bytes in the reused opaque-data buffer.`);
});

void test("accepts more than 128 MiB of aggregate JSON without retaining padding", () => {
  const paddingLength = 1024 * 1024;
  const payload = concat(Uint8Array.of(0x42), encoder.encode('{"event":"screen"}'), new Uint8Array(paddingLength).fill(0x20));
  const record = frame(53, 1, payload);
  const initial = concat(nsgHeader(), timeAnchor());
  const recordCount = 129;
  const parser = new StreamDecoder({ name: "large-decoded-history.log", size: initial.length + record.length * recordCount });
  parser.push(initial);
  for (let index = 0; index < recordCount; index++) parser.push(record);
  const log = parser.finish();
  assert.ok(log.recognizedPayloadBytes > 128 * 1024 ** 2);
  assert.equal(log.events.length, recordCount);
  assert.deepEqual(log.events.at(-1)?.data, { event: "screen" });
});

void test("retains bounds on individual XML headers and JSON events", () => {
  const xmlLength = 1024 ** 2 + 1;
  const oversizedHeader = concat(encoder.encode("!NSG"), varint(xmlLength));
  const headerParser = new StreamDecoder({ name: "oversized-header.log", size: oversizedHeader.length + xmlLength });
  assert.throws(() => headerParser.push(oversizedHeader), /unsupported NSG XML header length/);
  const payloadLength = 16 * 1024 ** 2 + 2;
  const oversizedEvent = concat(
    nsgHeader(),
    timeAnchor(),
    varint(0),
    varint(0),
    varint(1),
    varint(53),
    varint(0),
    varint(payloadLength),
    Uint8Array.of(0x42),
  );
  const eventParser = new StreamDecoder({ name: "oversized-event.log", size: oversizedEvent.length + payloadLength - 1 });
  assert.throws(() => eventParser.push(oversizedEvent), /event exceeds the 16 MiB limit/);
});

void test("rejects wrong magic, unsafe integers, truncated records and invalid recognized JSON", () => {
  assert.throws(() => parseRecording(encoder.encode("text")), /Expected an NSG !NSG log/);
  assert.throws(() => parseRecording(concat(encoder.encode("!NSG"), varint(2n ** 53n))), /safe integer/);
  assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), Uint8Array.of(0x80))), /Truncated NSG log/);
  assert.throws(() => parseRecording(mixedRecordingBytes().slice(0, -1)), /Truncated NSG record payload/);
  assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), frame(53, 1, Uint8Array.of(0x42, 0xff)))), /Invalid UTF-8 or JSON/);
  assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), frame(53, 1, encoder.encode("B[]")))), /JSON event object/);
  assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), jsonEvent(1, { event: "ScheduleCellInfo", cells: [null] }))), /cell object/);
});

void test("can discard only an incomplete final record when explicitly enabled", () => {
  const complete = jsonEvent(1, { event: "ScheduleCellInfo", cells: [{ type: "nr5g", registered: true, "ss-rsrp": -95 }] });
  const incomplete = jsonEvent(2, { event: "ScheduleCellInfo", cells: [{ type: "nr5g", registered: true, "ss-rsrp": -90 }] }).slice(0, -8);
  const bytes = concat(nsgHeader(), timeAnchor(), complete, incomplete);
  const strict = new StreamDecoder({ name: "strict.log", size: bytes.length });
  assert.throws(() => strict.push(bytes), /Truncated NSG record payload/);

  const tolerant = new StreamDecoder({ name: "tolerant.log", size: bytes.length }, { allowIncompleteFinalRecord: true });
  for (let start = 0; start < bytes.length; start += 3) tolerant.push(bytes.subarray(start, start + 3));
  const log = tolerant.finish();
  assert.equal(log.inputTruncated, true);
  assert.equal(log.recordCount, 2);
  assert.equal(log.events.length, 1);
  assert.equal(log.cells.length, 1);
  assert.equal(log.cells[0].rat, "NR");
  assert.equal(log.cells[0].rsrp, -95);
});

void test("can discard an incomplete final record header at every ULEB boundary", () => {
  const complete = concat(nsgHeader(), timeAnchor());
  const payload = concat(Uint8Array.of(0x42), encoder.encode('{"event":"screen"}'));
  const record = concat(varint(7), varint(130), varint(16_384), varint(53), varint(99), varint(payload.length), payload);
  const headerLength = record.length - payload.length;

  for (let length = 1; length < headerLength; length++) {
    const bytes = concat(complete, record.subarray(0, length));
    const tolerant = new StreamDecoder({ name: "partial-header.log", size: bytes.length }, { allowIncompleteFinalRecord: true });
    for (let start = 0; start < bytes.length; start += 2) tolerant.push(bytes.subarray(start, start + 2));
    const log = tolerant.finish();
    assert.equal(log.inputTruncated, true);
    assert.equal(log.recordCount, 1);
    assert.equal(log.events.length, 0);

    const strict = new StreamDecoder({ name: "strict-partial-header.log", size: bytes.length });
    strict.push(bytes);
    assert.throws(() => strict.finish(), /Truncated NSG log/);
  }
});

void test("supports incomplete final headers when the decoded size is unknown", () => {
  const bytes = concat(nsgHeader(), timeAnchor(), varint(7), Uint8Array.of(0x80));
  const tolerant = new StreamDecoder({ name: "compressed.log.gz", size: 1, decodedSize: null }, { allowIncompleteFinalRecord: true });
  tolerant.push(bytes);
  const log = tolerant.finish();
  assert.equal(log.inputTruncated, true);
  assert.equal(log.recordCount, 1);
});

void test("does not hide invalid complete headers or malformed ULEB fields in tolerant mode", () => {
  const invalidAnchorHeader = concat(nsgHeader(), varint(7), varint(0), varint(0), varint(0), varint(99), varint(7));
  const invalidAnchor = new StreamDecoder(
    { name: "invalid-anchor-header.log", size: invalidAnchorHeader.length },
    { allowIncompleteFinalRecord: true },
  );
  assert.throws(() => invalidAnchor.push(invalidAnchorHeader), /Unsupported NSG time anchor/);

  const overlong = concat(nsgHeader(), timeAnchor(), new Uint8Array(10).fill(0x80));
  const malformedUleb = new StreamDecoder({ name: "overlong-header.log", size: overlong.length }, { allowIncompleteFinalRecord: true });
  assert.throws(() => malformedUleb.push(overlong), /Unterminated NSG ULEB128 integer/);
});

void test("rejects invalid declared sizes and streams that differ from their declaration", () => {
  for (const size of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new StreamDecoder({ name: "invalid-size.log", size }), /Invalid NSG file size/);

  for (const decodedSize of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new StreamDecoder({ name: "invalid-decoded-size.log.gz", size: 1, decodedSize }), /Invalid decoded NSG file size/);

  const bytes = concat(nsgHeader(), timeAnchor());
  const smaller = new StreamDecoder({ name: "smaller.log", size: bytes.length - 1 });
  assert.throws(() => smaller.push(bytes), /stream exceeds the declared file size/);

  const larger = new StreamDecoder({ name: "larger.log", size: bytes.length + 1 });
  larger.push(bytes);
  assert.throws(() => larger.finish(), /Truncated NSG log/);
});

void test("rejects a ten-byte unterminated ULEB128 field", () => {
  const bytes = concat(encoder.encode("!NSG"), new Uint8Array(10).fill(0x80));
  const parser = new StreamDecoder({ name: "unterminated-varint.log", size: bytes.length });
  assert.throws(() => parser.push(bytes), /Unterminated NSG ULEB128 integer/);
});

void test("accepts XML and JSON payloads at their exact byte limits", () => {
  const maxXmlBytes = 1024 ** 2;
  const headerBytes = nsgHeader("x".repeat(maxXmlBytes));
  const headerLog = parseRecording(concat(headerBytes, timeAnchor()));
  assert.equal(headerLog.headerXml.length, maxXmlBytes);

  const maxJsonBytes = 16 * 1024 ** 2;
  const prefix = '{"event":"screen","padding":"';
  const suffix = '"}';
  const json = encoder.encode(prefix + " ".repeat(maxJsonBytes - prefix.length - suffix.length) + suffix);
  assert.equal(json.byteLength, maxJsonBytes);
  const eventLog = parseRecording(concat(nsgHeader(), timeAnchor(), frame(53, 1, concat(Uint8Array.of(0x42), json))));
  assert.equal(eventLog.events[0].name, "screen");
  assert.equal(eventLog.recognizedPayloadBytes, maxJsonBytes);
});
