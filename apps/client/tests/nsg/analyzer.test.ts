import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { mapNsgAnalyzerCell } from "../../src/features/analyzer/nsg/cellAdapter";
import { parseNsgAnalyzerStream } from "../../src/features/analyzer/nsg/parseImport";
import { MAX_SIGNAL_AGE_MS, createServingCellTimeline, resolveServingCellAt } from "../../src/features/nsg-explorer/cells/servingTimeline";
import { createSignalTrail } from "../../src/features/nsg-explorer/map/signalTrail";
import {
  collectAnalyzerRequests,
  collectMatchedStations,
  getAnalyzerRequestKey,
  getAnalyzerRequestsIdentity,
  getAnalyzerResultForCell,
  mapAnalyzerResults,
  resolveReplayServingCell,
  resolveReplayServingStation,
} from "../../src/features/nsg-explorer/stations/correlation";
import type { AnalyzerResult, AnalyzerStation } from "../../src/lib/analyzer/api";
import { ANALYZER_REQUEST_CHUNK_SIZE, chunkAnalyzerCells } from "../../src/lib/analyzer/chunks";
import { parseNsgTimestampMs } from "../../src/lib/nsg-parser";
import { isNsgFileHeader, openNsgFile } from "../../src/lib/nsg-parser/browser";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import type { NsgCell, NsgJsonObject, NsgLocation, NsgProgress } from "../../src/lib/nsg-parser/model";
import { bytesFromHex, concatBytes, encodeVarint } from "./binary";

const encoder = new TextEncoder();
const EPOCH_US = 1_788_614_058_216_807n;
const LTE = { type: "LTE", mcc: "260", mnc: "06", eci: 4365923, tac: 1234, pci: 381, earfcn: 3350 };
const B97F_ONE_CELL = bytesFromHex(
  "7c007fb9b571ced62e511201090002000000e130011400001314000002000000" +
    "c0ea09000001b3030001000021c1ffff00b2ffffffffffffffff0000ffffffff" +
    "b3031c020100000082c0ffff9ef6ffff010000000000000000000000ae1534e6" +
    "1e0a400b8bbfffff0ac0ffff82c0ffff9ef6ffff0000000000000000",
);
const LTE_SERVICE_REQUEST = bytesFromHex("1400edb0a13980ea1f51120101090500c73ea40f");

function frame(type: number, elapsedUs: number, payload: Uint8Array): Uint8Array {
  return concatBytes(...[0, 0, elapsedUs, type, 0, payload.length].map(encodeVarint), payload);
}

function start(): Uint8Array {
  const xml = encoder.encode("<root />");
  const epoch = new Uint8Array(8);
  new DataView(epoch.buffer).setBigUint64(0, EPOCH_US, true);
  return concatBytes(encoder.encode("!NSG"), encodeVarint(xml.length), xml, frame(0, 0, epoch));
}

function event(cells: NsgJsonObject[], elapsedUs = 0): Uint8Array {
  return frame(53, elapsedUs, concatBytes(Uint8Array.of(0x42), encoder.encode(JSON.stringify({ event: "ScheduleCellInfo", cells }))));
}

function normalized(raw: NsgJsonObject): NsgCell {
  const bytes = concatBytes(start(), event([raw]));
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  parser.push(bytes);
  return parser.finish().cells[0];
}

function stream(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index === parts.length) controller.close();
      else controller.enqueue(parts[index++]);
    },
  });
}

function parse(parts: Uint8Array[]) {
  return parseNsgAnalyzerStream(stream(parts), { name: "synthetic.log", size: parts.reduce((sum, part) => sum + part.length, 0) });
}

async function parseFile(file: File, onProgress?: (progress: NsgProgress) => void) {
  const { stream: fileStream, source } = await openNsgFile(file);
  return parseNsgAnalyzerStream(fileStream, source, onProgress);
}

function timedCell(raw: NsgJsonObject, offsetMs: number, eventIndex: number, cellIndex = 0): NsgCell {
  const timestampMs = 1_788_614_058_000 + offsetMs;
  return {
    ...normalized(raw),
    elapsedUs: offsetMs * 1000,
    timestampUs: (BigInt(timestampMs) * 1000n).toString(),
    timestampMs,
    eventIndex,
    cellIndex,
    slotId: typeof raw.slotId === "number" ? raw.slotId : null,
    subId: typeof raw.subId === "number" ? raw.subId : null,
  };
}

function analyzerStation(id: number): AnalyzerStation {
  return {
    id,
    station_id: `station-${id}`,
    notes: null,
    extra_address: null,
    updatedAt: "2026-09-06T00:00:00.000Z",
    createdAt: "2026-09-06T00:00:00.000Z",
    statusChangedAt: "2026-09-06T00:00:00.000Z",
    is_confirmed: true,
    operator: { id, name: `Operator ${id}`, full_name: `Operator ${id}`, parent_id: null, mnc: 26000 + id },
    location: {
      id,
      city: null,
      address: null,
      longitude: 20 + id,
      latitude: 50 + id,
      updatedAt: "2026-09-06T00:00:00.000Z",
      createdAt: "2026-09-06T00:00:00.000Z",
      region: { id, name: `Region ${id}`, code: `R${id}` },
    },
  };
}

function analyzerResult(status: "found" | "probable", station: AnalyzerStation): AnalyzerResult {
  return { status, station, warnings: [] };
}

function matchedStation(station: AnalyzerStation, confidence: "exact" | "probable" = "exact") {
  return { station, confidence } as const;
}

void test("maps complete LTE identity and preserves zero-valued required and optional fields", () => {
  assert.deepEqual(mapNsgAnalyzerCell(normalized(LTE)), { rat: "LTE", mnc: 26006, tac: 1234, enbid: 17054, clid: 99, pci: 381, earfcn: 3350 });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ ...LTE, eci: 0, tac: 0, pci: 0, earfcn: 0 })), {
    rat: "LTE",
    mnc: 26006,
    tac: 0,
    enbid: 0,
    clid: 0,
    pci: 0,
    earfcn: 0,
  });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ ...LTE, earfcn: 2147483647 })), {
    rat: "LTE",
    mnc: 26006,
    tac: 1234,
    enbid: 17054,
    clid: 99,
    pci: 381,
  });
});

void test("rejects missing, fractional, negative, sentinel and out-of-domain required identities", () => {
  for (const [field, values] of Object.entries({
    eci: [null, -1, 1.5, 0x10000000, 2147483647],
    tac: [null, -1, 0x10000, 2147483647],
    pci: [null, -1, 504, 2147483647],
  }))
    for (const value of values) assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, [field]: value })), null, `${field}=${value}`);
});

void test("uses one canonical PLMN encoding without aliasing three-digit MNCs", () => {
  for (const mnc of ["6", "06", 6]) assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, mnc }))?.mnc, 26006);
  assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, mnc: "006" }))?.mnc, 260006);
  assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, mnc: "100" }))?.mnc, 260100);
  for (const mnc of [null, "", "-1", "6x", "6.0"]) assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, mnc })), null);
  for (const mcc of [null, "", "00", "000", "260x"]) assert.equal(mapNsgAnalyzerCell(normalized({ ...LTE, mcc })), null);
});

void test("maps GSM plus explicit and combined UMTS identities without inferring invalid identities or NR support", () => {
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "GSM", mcc: "260", mnc: "02", lac: 0, cid: 0 })), {
    rat: "GSM",
    mnc: 26002,
    lac: 0,
    cid: 0,
  });
  assert.equal(mapNsgAnalyzerCell(normalized({ type: "GSM", mcc: "260", mnc: "02", lac: 1, cid: 65536 })), null);
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "WCDMA", mcc: "260", mnc: "02", lac: 12, cid: 34, rnc: 56, uarfcn: 0 })), {
    rat: "UMTS",
    mnc: 26002,
    lac: 12,
    cid: 34,
    rnc: 56,
    uarfcn: 0,
  });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 12, ci: 56 * 0x10000 + 34, uarfcn: 0 })), {
    rat: "UMTS",
    mnc: 26002,
    lac: 12,
    cid: 34,
    rnc: 56,
    uarfcn: 0,
  });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 0, ci: 0 })), {
    rat: "UMTS",
    mnc: 26002,
    lac: 0,
    cid: 0,
    rnc: 0,
  });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "WCDMA", mcc: "260", mnc: "02", lac: 0xffff, ci: 0x0fffffff })), {
    rat: "UMTS",
    mnc: 26002,
    lac: 0xffff,
    cid: 0xffff,
    rnc: 0xfff,
  });
  assert.deepEqual(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 12, ci: 56 * 0x10000 + 34, cid: 7, rnc: 8 })), {
    rat: "UMTS",
    mnc: 26002,
    lac: 12,
    cid: 7,
    rnc: 8,
  });
  for (const ci of [-1, 1.5, 0x10000000, 2147483647, "3670050"])
    assert.equal(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 12, ci })), null, `ci=${ci}`);
  assert.equal(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 12, cid: 123456 })), null);
  assert.equal(mapNsgAnalyzerCell(normalized({ type: "UMTS", mcc: "260", mnc: "02", lac: 12, cid: 34 })), null);
  assert.equal(mapNsgAnalyzerCell(normalized({ type: "NR", mcc: "260", mnc: "02", nci: 123456 })), null);
});

void test("deduplicates repeated identities across SIMs while retaining diagnostic configuration differences", async () => {
  const result = await parse([
    start(),
    event([
      { ...LTE, registered: true },
      { ...LTE, registered: false },
      { ...LTE, tac: 4321 },
    ]),
    event([{ ...LTE, registered: false }, { ...LTE, pci: 382 }, { ...LTE, earfcn: 3450 }, { type: "LTE" }, { type: "NR" }], 1000000),
  ]);
  assert.equal(result.rows.length, 4);
  assert.equal(result.totalCells, 8);
  assert.equal(result.duplicateCells, 2);
  assert.equal(result.invalidCells, 1);
  assert.equal(result.unsupportedCells, 1);
  assert.match(result.rows[0].rawLine, /2026-09-05T13:14:19\.216807Z/);
});

void test("routes gzip input and preserves raw NSG analyzer semantics", async () => {
  const bytes = concatBytes(
    start(),
    event([{ ...LTE, registered: true }, { ...LTE, registered: false }, { ...LTE, tac: 4321 }, { type: "LTE" }, { type: "NR" }]),
  );
  const compressed = Uint8Array.from(gzipSync(bytes));
  assert.equal(isNsgFileHeader(bytes.subarray(0, 4)), true);
  assert.equal(isNsgFileHeader(compressed.subarray(0, 4)), true);
  assert.equal(isNsgFileHeader(encoder.encode("text")), false);

  const plain = await parseFile(new File([Uint8Array.from(bytes)], "recording.log"));
  const progress: NsgProgress[] = [];
  const gzip = await parseFile(new File([compressed], "recording.log.gz"), (update) => progress.push(update));

  assert.deepEqual(gzip, plain);
  assert.equal(progress.at(-1)?.bytesRead, compressed.length);
  assert.equal(progress.at(-1)?.totalBytes, compressed.length);
  assert.equal(progress.at(-1)?.percent, 100);
});

void test("keeps completed analyzer rows when the final NSG record is incomplete", async () => {
  const incomplete = event([{ ...LTE, tac: 4321 }], 1_000_000);
  const bytes = concatBytes(start(), event([{ ...LTE, registered: true }]), incomplete.subarray(0, incomplete.length - 10));
  const strict = new StreamDecoder({ name: "truncated.log", size: bytes.length });

  assert.throws(() => strict.push(bytes), /Truncated NSG record payload/);

  const progress: NsgProgress[] = [];
  const result = await parseNsgAnalyzerStream(stream([bytes]), { name: "truncated.log", size: bytes.length }, (update) => progress.push(update));

  assert.equal(result.rows.length, 1);
  assert.equal(result.totalCells, 1);
  assert.equal(result.invalidCells, 0);
  assert.equal(result.unsupportedCells, 0);
  assert.equal(progress.at(-1)?.eventCount, 1);
  assert.equal(progress.at(-1)?.cellCount, 1);
  assert.equal(progress.at(-1)?.bytesRead, bytes.length);
});

void test("analyzes concatenated gzip members as one NSG log", async () => {
  const bytes = concatBytes(
    start(),
    event([{ ...LTE, registered: true }, { ...LTE, registered: false }, { ...LTE, tac: 4321 }, { type: "LTE" }, { type: "NR" }]),
  );
  const splitAt = Math.floor(bytes.length / 2);
  const compressed = concatBytes(Uint8Array.from(gzipSync(bytes.subarray(0, splitAt))), Uint8Array.from(gzipSync(bytes.subarray(splitAt))));

  const plain = await parseFile(new File([bytes], "recording.log"));
  const gzip = await parseFile(new File([compressed], "recording.log.gz"));

  assert.deepEqual(gzip, plain);
});

void test("keeps analyzer parsing bounded by ignoring retained Qualcomm type-16 decoding", async () => {
  const result = await parse([
    start(),
    frame(16, 800_000, LTE_SERVICE_REQUEST),
    frame(16, 900_000, B97F_ONE_CELL),
    event([{ ...LTE, registered: true }], 1_000_000),
  ]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.totalCells, 1);
  assert.equal(result.unsupportedCells, 0);
});

void test("bounds retained analyzer rows for a long repeated recording", async () => {
  const first = start();
  const repeated = event(Array.from({ length: 10 }, () => LTE));
  const repetitions = 10000;
  let count = 0;
  const updates: NsgProgress[] = [];
  const result = await parseNsgAnalyzerStream(
    new ReadableStream({
      pull(controller) {
        if (count === 0) controller.enqueue(first);
        else if (count <= repetitions) controller.enqueue(repeated);
        else controller.close();
        count++;
      },
    }),
    { name: "repeated.log", size: first.length + repeated.length * repetitions },
    (progress) => updates.push(progress),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.totalCells, 100000);
  assert.equal(result.duplicateCells, 99999);
  assert.equal(updates.at(-1)?.eventCount, repetitions);
  assert.equal(updates.at(-1)?.cellCount, 100000);
  assert.equal(updates.at(-1)?.percent, 100);
});

void test("fails on the 20,001st distinct valid analyzer row instead of returning truncated results", async () => {
  const cells = Array.from({ length: 20001 }, (_, eci) => ({ ...LTE, eci }));
  await assert.rejects(parse([start(), event(cells)]), { name: "AnalyzerCellLimitError" });
  const accepted = await parse([start(), event(cells.slice(0, 20000))]);
  assert.equal(accepted.rows.length, 20000);
});

void test("collects only registered analyzable serving identities in deterministic canonical order", () => {
  const cells = [
    timedCell({ ...LTE, registered: true, eci: 0, tac: 0, pci: 0, earfcn: 0 }, 0, 0),
    timedCell({ ...LTE, registered: true, eci: 0, tac: 0, pci: 0, earfcn: 0 }, 100, 1),
    timedCell({ ...LTE, registered: true, eci: 0, tac: 0, pci: 0, earfcn: null }, 200, 2),
    timedCell({ type: "GSM", registered: true, mcc: "260", mnc: "02", lac: 0, cid: 0 }, 300, 3),
    timedCell({ type: "WCDMA", registered: true, mcc: "260", mnc: "03", lac: 0, cid: 0, rnc: 0, uarfcn: 0 }, 400, 4),
    timedCell({ type: "GSM", registered: false, mcc: "260", mnc: "02", lac: 1, cid: 1 }, 500, 5),
    timedCell({ type: "NR", registered: true, mcc: "260", mnc: "02", nci: 1 }, 600, 6),
  ];

  const requests = collectAnalyzerRequests(cells);
  assert.deepEqual(
    requests.map(({ input }) => input.rat),
    ["GSM", "LTE", "LTE", "UMTS"],
  );
  assert.equal(requests.filter(({ input }) => input.rat === "LTE").length, 2);
  assert.ok(requests.some(({ key }) => key.includes('"earfcn":0')));
  assert.ok(requests.some(({ key }) => !key.includes('"earfcn"')));
  assert.ok(requests.some(({ key }) => key.includes('"tac":0') && key.includes('"pci":0')));
  assert.deepEqual(
    requests.map(({ key }) => key),
    requests.map(({ key }) => key).sort(),
  );
});

void test("maps Analyzer responses back to canonical identities positionally and rejects count drift", () => {
  const requests = collectAnalyzerRequests([
    timedCell({ ...LTE, registered: true, tac: 1 }, 0, 0),
    timedCell({ ...LTE, registered: true, tac: 2 }, 100, 1),
  ]);
  const first = analyzerResult("found", analyzerStation(1));
  const second = analyzerResult("probable", analyzerStation(2));
  const resultsByKey = mapAnalyzerResults(requests, [first, second]);

  assert.strictEqual(resultsByKey.get(requests[0].key), first);
  assert.strictEqual(resultsByKey.get(requests[1].key), second);
  assert.throws(() => mapAnalyzerResults(requests, [first]), /returned 1 results for 2 NSG cell requests/);
});

void test("deduplicates matched stations for any filtered cell subset", () => {
  const probableCell = timedCell({ ...LTE, registered: true, tac: 1 }, 500, 1);
  const exactCell = timedCell({ ...LTE, registered: true, tac: 2 }, 1500, 2);
  const otherCell = timedCell({ type: "GSM", registered: true, mcc: "260", mnc: "02", lac: 3, cid: 4 }, 1000, 3);
  const ignoredCell = timedCell({ ...LTE, registered: false, tac: 2 }, 2000, 4);
  const requests = collectAnalyzerRequests([probableCell, exactCell, otherCell]);
  const sharedStation = analyzerStation(7);
  const results = requests.map(({ input }) => {
    if (input.rat === "GSM") return analyzerResult("found", analyzerStation(3));
    if (input.tac === 1) return analyzerResult("probable", sharedStation);
    return analyzerResult("found", sharedStation);
  });
  const resultsByKey = mapAnalyzerResults(requests, results);

  const stations = collectMatchedStations([probableCell, exactCell, otherCell, ignoredCell], resultsByKey);
  assert.deepEqual(
    stations.map(({ station }) => station.id),
    [3, 7],
  );
  assert.equal(stations[1].confidence, "exact");
  assert.deepEqual(
    collectMatchedStations([otherCell], resultsByKey).map(({ station }) => station.id),
    [3],
  );
  assert.strictEqual(getAnalyzerResultForCell(resultsByKey, exactCell)?.station, sharedStation);
  assert.equal(getAnalyzerResultForCell(resultsByKey, ignoredCell), null);
});

void test("resolves the selected SIM serving timeline without depending on signal strength", () => {
  const sim = { slotId: 0, subId: 2 };
  const serving = timedCell({ ...LTE, registered: true, dbm: null, slotId: 0, subId: 2 }, 1000, 1);
  const otherSim = timedCell({ ...LTE, registered: true, slotId: 1, subId: 3 }, 1500, 2);
  const disconnected = timedCell({ ...LTE, registered: false, slotId: 0, subId: 2 }, 2000, 3);
  const ambiguousA = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 3000, 4, 0);
  const ambiguousB = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 2 }, 3000, 4, 1);
  const timeline = createServingCellTimeline([ambiguousB, disconnected, otherSim, serving, ambiguousA], sim);
  const freshnessTimeline = createServingCellTimeline([serving], sim);

  assert.equal(timeline.length, 3);
  assert.deepEqual(resolveReplayServingCell(timeline, serving.timestampMs - 1), { status: "missing", measurement: null });
  assert.strictEqual(resolveReplayServingCell(timeline, serving.timestampMs).measurement, serving);
  assert.strictEqual(resolveReplayServingCell(freshnessTimeline, serving.timestampMs + MAX_SIGNAL_AGE_MS).measurement, serving);
  assert.deepEqual(resolveReplayServingCell(freshnessTimeline, serving.timestampMs + MAX_SIGNAL_AGE_MS + 0.001), {
    status: "stale",
    measurement: null,
  });
  assert.deepEqual(resolveReplayServingCell(timeline, disconnected.timestampMs), { status: "missing", measurement: null });
  assert.deepEqual(resolveReplayServingCell(timeline, ambiguousA.timestampMs), { status: "ambiguous", measurement: null });
  assert.deepEqual(resolveReplayServingCell(timeline, Number.NaN), { status: "invalid", measurement: null });
  assert.deepEqual(createServingCellTimeline([serving], null), []);
  assert.deepEqual(createServingCellTimeline([serving], { slotId: null, subId: null }), []);
});

void test("keeps signal trails and station connectors aligned at sub-millisecond boundaries", () => {
  const sim = { slotId: 0, subId: 2 };
  const first = timedCell({ ...LTE, registered: true, dbm: -90, slotId: 0, subId: 2, tac: 1 }, 1000, 5);
  const second = timedCell({ ...LTE, registered: true, dbm: -80, slotId: 0, subId: 2, tac: 2 }, 1000, 6);
  first.timestampUs = (BigInt(first.timestampUs) + 200n).toString();
  second.timestampUs = (BigInt(second.timestampUs) + 500n).toString();
  const timeline = createServingCellTimeline([first, second], sim);
  const requests = collectAnalyzerRequests([first, second]);
  const firstStation = analyzerStation(10);
  const secondStation = analyzerStation(20);
  const resultsByKey = mapAnalyzerResults(
    requests,
    requests.map(({ input }) => analyzerResult("found", input.rat === "LTE" && input.tac === 1 ? firstStation : secondStation)),
  );
  const playheadMs = first.timestampMs + 0.4;
  const location: NsgLocation = {
    elapsedUs: 1_000_400,
    timestampUs: (BigInt(first.timestampUs) + 200n).toString(),
    timestampMs: playheadMs,
    eventIndex: 7,
    latitude: 52,
    longitude: 21,
    accuracy: null,
    altitude: null,
    speed: null,
    provider: null,
    fixTimestampMs: null,
  };

  assert.deepEqual(resolveReplayServingCell(timeline, first.timestampMs + 0.199), { status: "missing", measurement: null });
  assert.strictEqual(resolveReplayServingCell(timeline, playheadMs).measurement, first);
  assert.deepEqual(resolveReplayServingStation(timeline, playheadMs, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, parseNsgTimestampMs(first.timestampUs)!, resultsByKey), matchedStation(firstStation));
  assert.strictEqual(createSignalTrail([location], [first, second], sim).points[0].measurement, first);
  assert.strictEqual(resolveReplayServingCell(timeline, first.timestampMs + 0.5).measurement, second);
});

void test("uses exact microseconds when Number milliseconds collapse", () => {
  const sim = { slotId: 0, subId: 2 };
  const first = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 0, 1);
  const second = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 2 }, 0, 2);
  const firstTimestampUs = 8_639_999_999_999_998_000n;
  const secondTimestampUs = firstTimestampUs + 1n;
  const collapsedTimestampMs = parseNsgTimestampMs(firstTimestampUs.toString());
  if (collapsedTimestampMs === null) assert.fail("Expected a finite timestamp");
  assert.equal(parseNsgTimestampMs(secondTimestampUs.toString()), collapsedTimestampMs);

  first.timestampUs = firstTimestampUs.toString();
  first.timestampMs = collapsedTimestampMs;
  second.timestampUs = secondTimestampUs.toString();
  second.timestampMs = collapsedTimestampMs;
  const timeline = createServingCellTimeline([second, first], sim);

  assert.deepEqual(
    timeline.map(({ timestampUs }) => timestampUs),
    [firstTimestampUs, secondTimestampUs],
  );
  assert.strictEqual(resolveServingCellAt(timeline, collapsedTimestampMs, firstTimestampUs).resolution.measurement, first);
  assert.strictEqual(resolveReplayServingCell(timeline, collapsedTimestampMs).measurement, second);
});

void test("cross-RAT serving snapshots replace an LTE station while LTE remains the display filter", () => {
  const sim = { slotId: 0, subId: 2 };
  const lte = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2 }, 1000, 1);
  const nr = timedCell({ type: "NR", registered: true, mcc: "260", mnc: "06", slotId: 0, subId: 2 }, 1500, 2);
  const umts = timedCell({ type: "WCDMA", registered: true, mcc: "260", mnc: "06", lac: 12, cid: 34, rnc: 56, slotId: 0, subId: 2 }, 2000, 3);
  const allCells = [lte, nr, umts];
  const lteDisplayCells = allCells.filter((cell) => cell.rat === "LTE");
  const timeline = createServingCellTimeline(allCells, sim);

  assert.deepEqual(lteDisplayCells, [lte]);
  assert.strictEqual(resolveReplayServingCell(timeline, nr.timestampMs - 0.001).measurement, lte);
  assert.strictEqual(resolveReplayServingCell(timeline, nr.timestampMs).measurement, nr);
  assert.strictEqual(resolveReplayServingCell(timeline, umts.timestampMs).measurement, umts);
});

void test("publishes serving station visual identity only at an exact station or confidence boundary", () => {
  const sim = { slotId: 0, subId: 2 };
  const first = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 1000, 1);
  const repeated = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 1100, 2);
  const sameStation = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 2 }, 1200, 3);
  const probableSameStation = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 4 }, 1250, 4);
  const nextStation = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 3 }, 1300, 5);
  const cells = [first, repeated, sameStation, probableSameStation, nextStation];
  const requests = collectAnalyzerRequests(cells);
  const firstStation = analyzerStation(10);
  const secondStation = analyzerStation(20);
  const resultsByKey = mapAnalyzerResults(
    requests,
    requests.map(({ input }) => {
      if (input.rat === "LTE" && input.tac === 3) return analyzerResult("found", secondStation);
      return analyzerResult(input.rat === "LTE" && input.tac === 4 ? "probable" : "found", firstStation);
    }),
  );
  const timeline = createServingCellTimeline(cells, sim);

  assert.equal(resolveReplayServingStation(timeline, first.timestampMs - 0.001, resultsByKey), null);
  assert.deepEqual(resolveReplayServingStation(timeline, first.timestampMs, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, repeated.timestampMs, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, sameStation.timestampMs, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, probableSameStation.timestampMs - 0.001, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, probableSameStation.timestampMs, resultsByKey), matchedStation(firstStation, "probable"));
  assert.deepEqual(resolveReplayServingStation(timeline, nextStation.timestampMs - 0.001, resultsByKey), matchedStation(firstStation, "probable"));
  assert.deepEqual(resolveReplayServingStation(timeline, nextStation.timestampMs, resultsByKey), matchedStation(secondStation));
});

void test("tracks tightly interleaved all-SIM stations without republishing an unchanged visible endpoint", () => {
  const simOneFirst = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 1000, 1);
  const simTwoSameStation = timedCell({ ...LTE, registered: true, slotId: 1, subId: 3, tac: 2 }, 1001, 2);
  const simOneRepeated = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 1002, 3);
  const simTwoNextStation = timedCell({ ...LTE, registered: true, slotId: 1, subId: 3, tac: 3 }, 1003, 4);
  const cells = [simOneFirst, simTwoSameStation, simOneRepeated, simTwoNextStation];
  const requests = collectAnalyzerRequests(cells);
  const firstStation = analyzerStation(10);
  const secondStation = analyzerStation(20);
  const resultsByKey = mapAnalyzerResults(
    requests,
    requests.map(({ input }) => analyzerResult("found", input.rat === "LTE" && input.tac === 3 ? secondStation : firstStation)),
  );
  const sourceMatches = collectMatchedStations(cells, resultsByKey);
  const timeline = createServingCellTimeline(cells, "all");
  const resolvedStations = [simOneFirst, simTwoSameStation, simOneRepeated, simTwoNextStation].map((cell) =>
    resolveReplayServingStation(timeline, cell.timestampMs, resultsByKey),
  );
  const publications = resolvedStations.filter(
    (match, index) =>
      index === 0 || match?.station.id !== resolvedStations[index - 1]?.station.id || match?.confidence !== resolvedStations[index - 1]?.confidence,
  );

  assert.deepEqual(resolvedStations, [
    matchedStation(firstStation),
    matchedStation(firstStation),
    matchedStation(firstStation),
    matchedStation(secondStation),
  ]);
  assert.deepEqual(publications, [matchedStation(firstStation), matchedStation(secondStation)]);
  assert.deepEqual(resolveReplayServingStation(timeline, simTwoNextStation.timestampMs - 0.001, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, simTwoNextStation.timestampMs, resultsByKey), matchedStation(secondStation));
  assert.deepEqual(
    sourceMatches.map(({ station }) => station.id),
    [firstStation.id, secondStation.id],
  );
});

void test("separates normalized serving cells for two SIMs reported by the same event", () => {
  const previous = timedCell({ ...LTE, registered: true, slotId: 1, subId: 3, tac: 1 }, 999, 0);
  const simOneServing = timedCell({ ...LTE, registered: true, slotId: 0, subId: 2, tac: 1 }, 1000, 1, 0);
  const simOneNeighbor = timedCell({ ...LTE, registered: false, slotId: 0, subId: 2, tac: 11 }, 1000, 1, 1);
  const simTwoNeighbor = timedCell({ ...LTE, registered: false, slotId: 1, subId: 3, tac: 12 }, 1000, 1, 2);
  const simTwoServing = timedCell({ ...LTE, registered: true, slotId: 1, subId: 3, tac: 2 }, 1000, 1, 3);
  const cells = [previous, simOneServing, simOneNeighbor, simTwoNeighbor, simTwoServing];
  const requests = collectAnalyzerRequests(cells);
  const firstStation = analyzerStation(10);
  const secondStation = analyzerStation(20);
  const resultsByKey = mapAnalyzerResults(
    requests,
    requests.map(({ input }) => analyzerResult("found", input.rat === "LTE" && input.tac === 2 ? secondStation : firstStation)),
  );
  const timeline = createServingCellTimeline(cells, "all");

  assert.deepEqual(
    timeline.map(({ serving }) => serving.map(({ slotId, subId, cellIndex }) => [slotId, subId, cellIndex])),
    [[[1, 3, 0]], [[0, 2, 0]], [[1, 3, 3]]],
  );
  assert.deepEqual(resolveReplayServingStation(timeline, simOneServing.timestampMs - 0.001, resultsByKey), matchedStation(firstStation));
  assert.deepEqual(resolveReplayServingStation(timeline, simOneServing.timestampMs, resultsByKey), matchedStation(secondStation));
  assert.deepEqual(
    resolveReplayServingStation(createServingCellTimeline(cells, { slotId: 0, subId: 2 }), simOneServing.timestampMs, resultsByKey),
    matchedStation(firstStation),
  );
  assert.deepEqual(
    resolveReplayServingStation(createServingCellTimeline(cells, { slotId: 1, subId: 3 }), simTwoServing.timestampMs, resultsByKey),
    matchedStation(secondStation),
  );
});

void test("canonical keys retain optional diagnostics and every zero-valued identifier", () => {
  assert.equal(
    getAnalyzerRequestKey({ rat: "UMTS", mnc: 0, lac: 0, cid: 0, rnc: 0, uarfcn: 0 }),
    '{"rat":"UMTS","mnc":0,"lac":0,"cid":0,"rnc":0,"uarfcn":0}',
  );
  assert.equal(
    getAnalyzerRequestKey({ rat: "LTE", mnc: 0, tac: 0, enbid: 0, clid: 0, pci: 0 }),
    '{"rat":"LTE","mnc":0,"tac":0,"enbid":0,"clid":0,"pci":0}',
  );
});

void test("uses a compact stable identity without conflating distinct analyzer request sets", () => {
  const first = collectAnalyzerRequests([timedCell({ ...LTE, registered: true, tac: 1 }, 0, 0)]);
  const same = collectAnalyzerRequests([timedCell({ ...LTE, registered: true, tac: 1 }, 100, 1)]);
  const different = collectAnalyzerRequests([timedCell({ ...LTE, registered: true, tac: 2 }, 0, 0)]);

  assert.equal(getAnalyzerRequestsIdentity(first), getAnalyzerRequestsIdentity(same));
  assert.notEqual(getAnalyzerRequestsIdentity(first), getAnalyzerRequestsIdentity(different));
  assert.ok(getAnalyzerRequestsIdentity(first).length < 32);
});

void test("chunks a 13,000-cell analyzer request below Fastify's one MiB body limit", () => {
  const cells = Array.from({ length: 13_000 }, (_, index) => ({
    rat: "LTE" as const,
    mnc: 26006,
    tac: index % 65_536,
    enbid: index,
    clid: index % 256,
    pci: index % 504,
    earfcn: 3_350,
  }));
  const chunks = chunkAnalyzerCells(cells);

  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [ANALYZER_REQUEST_CHUNK_SIZE, ANALYZER_REQUEST_CHUNK_SIZE, ANALYZER_REQUEST_CHUNK_SIZE, 1_000],
  );
  assert.ok(chunks.every((chunk) => JSON.stringify({ cells: chunk }).length < 1024 ** 2));
  assert.equal(chunks.flat().length, cells.length);
});
