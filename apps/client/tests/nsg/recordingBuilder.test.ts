import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { MAX_RETAINED_SIGNALING_RECORDS } from "../../src/lib/nsg-parser/internal/recordingBuilder";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import { QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { concatBytes as concat } from "./binary";
import {
  B0C2_PLUS,
  B97F_ONE_CELL,
  EPOCH_US,
  LTE_SERVICE_REQUEST,
  NR_RRC_V26,
  frame,
  jsonEvent,
  lteEvent,
  mixedRecordingBytes,
  nsgHeader,
  timeAnchor,
} from "./fixtures/nsgContainer";

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

void test("streams retained Qualcomm signaling with a compact cloneable payload", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const elapsedUs = 321_000;
  const bytes = concat(initial, frame(16, elapsedUs, LTE_SERVICE_REQUEST, 1));
  const expected = parseRecording(bytes);
  for (const chunkSize of [1, 2, 3, 7, 16, 31]) assert.deepEqual(parseRecording(bytes, chunkSize), expected);

  assert.equal(expected.signalingRecordCount, 1);
  assert.equal(expected.signalingTruncated, false);
  assert.equal(expected.signaling.length, 1);
  assert.deepEqual(expected.signaling[0], {
    id: 0,
    recordOffset: initial.length,
    streamIndex: 1,
    elapsedUs,
    timestampUs: (EPOCH_US + BigInt(elapsedUs)).toString(),
    timestampMs: Number((EPOCH_US + BigInt(elapsedUs)) / 1000n),
    packetLength: LTE_SERVICE_REQUEST.length,
    logCode: QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
    version: "1 (9.5.0)",
    rat: "LTE",
    layer: "NAS",
    direction: "UL",
    channel: "EMM",
    pduType: "Service Request",
    pduId: null,
    pci: null,
    channelNumber: null,
    rbid: null,
    payloadBytes: 4,
    payload: Uint8Array.from([0xc7, 0x3e, 0xa4, 0x0f]),
    metadata: {
      packetVersion: 1,
      protocolVersionMajor: 9,
      protocolVersionMinor: 5,
      protocolVersionRevision: 0,
      securityHeaderType: 12,
      protocolDiscriminator: 7,
    },
  });
  assert.deepEqual(structuredClone(expected).signaling, expected.signaling);
});

void test("retains only the declared DIAG packet when a signaling frame contains padding", () => {
  const padded = concat(LTE_SERVICE_REQUEST, new Uint8Array(70 * 1024).fill(0xa5));
  const log = parseRecording(concat(nsgHeader(), timeAnchor(), frame(16, 1, padded)), 17);
  const record = log.signaling[0];

  assert.ok(record);
  assert.equal(record.packetLength, LTE_SERVICE_REQUEST.length);
  assert.equal(record.payload.buffer.byteLength, LTE_SERVICE_REQUEST.length);
  assert.deepEqual(record.payload, Uint8Array.from([0xc7, 0x3e, 0xa4, 0x0f]));
});

void test("ignores malformed or unsupported Qualcomm signaling records", () => {
  const wrongVersion = LTE_SERVICE_REQUEST.slice();
  wrongVersion[12] = 2;
  const unsupported = LTE_SERVICE_REQUEST.slice();
  new DataView(unsupported.buffer).setUint16(2, 0xb0ea, true);
  const log = parseRecording(
    concat(nsgHeader(), timeAnchor(), frame(16, 1, wrongVersion), frame(16, 2, LTE_SERVICE_REQUEST.subarray(0, -1)), frame(16, 3, unsupported)),
    1,
  );

  assert.equal(log.signalingRecordCount, 0);
  assert.equal(log.signalingTruncated, false);
  assert.deepEqual(log.signaling, []);
});

void test("caps retained signaling records while reporting the complete decoded count", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const record = frame(16, 1, LTE_SERVICE_REQUEST);
  const nrRecord = frame(16, 2, NR_RRC_V26);
  const parser = new StreamDecoder({
    name: "signaling-cap.log",
    size: initial.length + record.length * MAX_RETAINED_SIGNALING_RECORDS + nrRecord.length,
  });
  parser.push(initial);
  for (let index = 0; index < MAX_RETAINED_SIGNALING_RECORDS; index++) parser.push(record);
  parser.push(nrRecord);
  const first = parser.finish();
  const second = parser.finish();

  assert.strictEqual(second, first);
  assert.equal(first.signalingRecordCount, MAX_RETAINED_SIGNALING_RECORDS + 1);
  assert.equal(first.signaling.length, MAX_RETAINED_SIGNALING_RECORDS);
  assert.equal(first.signaling.at(-1)?.id, MAX_RETAINED_SIGNALING_RECORDS - 1);
  assert.equal(first.recognizedPayloadBytes, LTE_SERVICE_REQUEST.length * MAX_RETAINED_SIGNALING_RECORDS + NR_RRC_V26.length);
  assert.equal(first.signalingTruncated, true);
});

void test("does not count malformed signaling after the retention cap", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const validRecord = frame(16, 1, LTE_SERVICE_REQUEST);
  const wrongVersion = LTE_SERVICE_REQUEST.slice();
  wrongVersion[12] = 2;
  const malformedRecord = frame(16, 1, wrongVersion);
  const parser = new StreamDecoder({
    name: "signaling-cap-malformed.log",
    size: initial.length + validRecord.length * (MAX_RETAINED_SIGNALING_RECORDS + 1) + malformedRecord.length,
  });
  parser.push(initial);
  for (let index = 0; index < MAX_RETAINED_SIGNALING_RECORDS; index++) parser.push(validRecord);
  parser.push(malformedRecord);
  parser.push(validRecord);
  const log = parser.finish();

  assert.equal(log.signalingRecordCount, MAX_RETAINED_SIGNALING_RECORDS + 1);
  assert.equal(log.signaling.length, MAX_RETAINED_SIGNALING_RECORDS);
  assert.equal(log.recognizedPayloadBytes, LTE_SERVICE_REQUEST.length * (MAX_RETAINED_SIGNALING_RECORDS + 1));
  assert.equal(log.signalingTruncated, true);
});

void test("caps retained signaling bytes while reporting every validated record", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const packet = new Uint8Array(0xffff);
  packet.set(LTE_SERVICE_REQUEST);
  new DataView(packet.buffer).setUint16(0, packet.length, true);
  const record = frame(16, 1, packet);
  const recordCount = 257;
  const retainedCount = 256;
  const parser = new StreamDecoder({
    name: "signaling-byte-cap.log",
    size: initial.length + record.length * recordCount,
  });

  parser.push(initial);
  for (let index = 0; index < recordCount; index++) parser.push(record);
  const log = parser.finish();

  assert.equal(log.signalingRecordCount, recordCount);
  assert.equal(log.signaling.length, retainedCount);
  assert.equal(log.recognizedPayloadBytes, packet.length * recordCount);
  assert.equal(log.signalingTruncated, true);
});

void test("finalizes retained NR association and cell callbacks exactly once", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const bytes = concat(initial, frame(16, 950_000, B97F_ONE_CELL), lteEvent(1_000_000));
  const observed: { rat: string; eventIndex: number; measurementRole: string | undefined; elapsedUs: number }[] = [];
  const parser = new StreamDecoder(
    { name: "finalized-callbacks.log", size: bytes.length },
    {
      onCell: (cell) =>
        observed.push({ rat: cell.rat, eventIndex: cell.eventIndex, measurementRole: cell.measurementRole, elapsedUs: cell.elapsedUs }),
    },
  );

  parser.push(bytes);
  assert.deepEqual(observed, []);
  const first = parser.finish();
  assert.deepEqual(observed, [
    { rat: "LTE", eventIndex: 0, measurementRole: "lte-secondary", elapsedUs: 1_000_000 },
    { rat: "NR", eventIndex: 0, measurementRole: "nr-primary", elapsedUs: 1_000_000 },
  ]);
  const cellCount = parser.progress().cellCount;
  const second = parser.finish();
  assert.strictEqual(second, first);
  assert.equal(first.cells.length, 2);
  assert.equal(parser.progress().cellCount, cellCount);
  assert.equal(observed.length, 2);
  assert.throws(() => parser.push(Uint8Array.of(0)), /finished NSG log/);
});

void test("preserves event and cell callback ordering in both parse modes", () => {
  const bytes = concat(nsgHeader(), timeAnchor(), lteEvent(1_000_000));
  for (const mode of ["complete", "streaming"] as const) {
    const callbacks: string[] = [];
    const parser = new StreamDecoder(
      { name: "callback-order.log", size: bytes.length },
      {
        mode,
        onCell: (cell) => callbacks.push(`cell:${cell.eventIndex}`),
        onEvent: (event) => callbacks.push(`event:${event.id}`),
      },
    );

    parser.push(bytes);
    assert.deepEqual(callbacks, mode === "complete" ? ["event:0"] : ["cell:0", "event:0"]);
    parser.finish();
    assert.deepEqual(callbacks, mode === "complete" ? ["event:0", "cell:0"] : ["cell:0", "event:0"]);
  }
});

void test("keeps streaming callbacks source-ordered without buffering derived NR cells", () => {
  const bytes = concat(
    nsgHeader(),
    timeAnchor(),
    frame(16, 850_000, LTE_SERVICE_REQUEST),
    frame(16, 900_000, B0C2_PLUS),
    frame(16, 950_000, B97F_ONE_CELL),
    lteEvent(1_000_000),
  );
  const observed: { rat: string; eventIndex: number; measurementRole: string | undefined }[] = [];
  const parser = new StreamDecoder(
    { name: "bounded-callbacks.log", size: bytes.length },
    {
      mode: "streaming",
      onCell: (cell) => observed.push({ rat: cell.rat, eventIndex: cell.eventIndex, measurementRole: cell.measurementRole }),
    },
  );

  parser.push(bytes);
  assert.deepEqual(observed, [{ rat: "LTE", eventIndex: 0, measurementRole: undefined }]);
  const log = parser.finish();
  assert.deepEqual(log.cells, []);
  assert.deepEqual(log.signaling, []);
  assert.equal(log.signalingRecordCount, 0);
  assert.equal(log.signalingTruncated, false);
  assert.equal(parser.progress().cellCount, 1);
  assert.equal(observed.length, 1);
});

void test("streaming mode emits cell callbacks without retaining history while preserving event indices and counters", () => {
  const bytes = concat(mixedRecordingBytes(), jsonEvent(1400000, { event: "ScheduleCellInfo", cells: [{ type: "lte", eci: 12 }] }));
  const observations: { eventIndex: number; cellIndex: number; eci: number | null }[] = [];
  const parser = new StreamDecoder(
    { name: "streaming.log", size: bytes.length },
    {
      mode: "streaming",
      onCell: ({ eventIndex, cellIndex, eci }) => observations.push({ eventIndex, cellIndex, eci }),
    },
  );
  parser.push(bytes);
  const log = parser.finish();
  assert.deepEqual(log.events, []);
  assert.deepEqual(log.cells, []);
  assert.deepEqual(log.locations, []);
  assert.deepEqual(observations, [
    { eventIndex: 0, cellIndex: 0, eci: 0 },
    { eventIndex: 0, cellIndex: 1, eci: null },
    { eventIndex: 0, cellIndex: 2, eci: null },
    { eventIndex: 3, cellIndex: 0, eci: 12 },
  ]);
  assert.equal(parser.progress().eventCount, 4);
  assert.equal(parser.progress().cellCount, 4);
  assert.equal(log.servingCellCount, 1);
  const retained = parseRecording(bytes);
  assert.equal(retained.events.length, 4);
  assert.equal(retained.cells.length, 4);
  assert.equal(retained.cells[3].eventIndex, 3);
});

void test("rejects missing, duplicate and unsupported time anchors", () => {
  assert.throws(() => parseRecording(nsgHeader()), /No supported NSG time anchor/);
  assert.throws(() => parseRecording(concat(nsgHeader(), jsonEvent(1, { event: "screen" }))), /precedes the time anchor/);
  assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), timeAnchor())), /Unsupported NSG time anchor/);
  assert.throws(() => parseRecording(concat(nsgHeader(), frame(0, 1, new Uint8Array(8)))), /Unsupported NSG time anchor/);
});

void test("reserves completed gzip progress for a successfully validated log", () => {
  const bytes = mixedRecordingBytes();
  const compressedSize = gzipSync(bytes).byteLength;
  const parser = new StreamDecoder({
    name: "synthetic.log.gz",
    size: compressedSize,
    decodedSize: null,
    inputBytesRead: () => compressedSize,
  });

  parser.push(bytes);
  assert.equal(parser.progress().bytesRead, Math.floor(compressedSize * 0.99));
  assert.ok(parser.progress().percent <= 99);
  parser.finish();
  assert.equal(parser.progress().bytesRead, compressedSize);
  assert.equal(parser.progress().percent, 100);
});
