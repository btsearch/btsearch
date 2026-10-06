import assert from "node:assert/strict";
import test from "node:test";

import { parseNsgAnalyzerStream } from "../../src/features/analyzer/nsg/parseImport";
import { collectRegisteredOperatorMncs, createOperatorResolver, getCellOperator } from "../../src/features/nsg-explorer/cells/operators";
import { createCellsCsv } from "../../src/features/nsg-explorer/export/cellsCsv";
import { StreamingOperatorState } from "../../src/lib/nsg-parser/internal/operatorState";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import type { NsgCell, NsgEvent, NsgJsonObject, NsgParseMode } from "../../src/lib/nsg-parser/model";
import { concatBytes as concat, encodeVarint as varint } from "./binary";

const encoder = new TextEncoder();
const EPOCH_US = 1_788_614_058_216_807n;
const LTE = { type: "LTE", registered: true, mcc: "260", mnc: "03", eci: 61956130, tac: 54201, pci: 347, earfcn: 3175, dbm: -90 };

function event(id: number, elapsedUs: number, data: NsgJsonObject): NsgEvent {
  return {
    id,
    name: String(data.event),
    elapsedUs,
    timestampUs: (EPOCH_US + BigInt(elapsedUs)).toString(),
    timestampMs: Number((EPOCH_US + BigInt(elapsedUs)) / 1000n),
    marker: 0x42,
    recordOffset: 0,
    data,
  };
}

function service(id: number, elapsedUs: number, overrides: NsgJsonObject = {}): NsgEvent {
  return event(id, elapsedUs, {
    event: "serviceState",
    slotId: 0,
    subId: 2,
    operator: "26002",
    "operator-long": "T-Mobile",
    state: "available",
    networks: [{ registered: true, registeredPLMN: "26002", rat: 13 }],
    ...overrides,
  });
}

function cells(id: number, elapsedUs: number, items: NsgJsonObject[] = [LTE], slotId = 0, subId = 2): NsgEvent {
  return event(id, elapsedUs, { event: "ScheduleCellInfo", slotId, subId, cells: items });
}

function frame(type: number, elapsedUs: number, payload: Uint8Array): Uint8Array {
  return concat(...[0, 0, elapsedUs, type, 0, payload.length].map(varint), payload);
}

function recording(events: NsgEvent[]): Uint8Array {
  const xml = encoder.encode("<root />");
  const epoch = new Uint8Array(8);
  new DataView(epoch.buffer).setBigUint64(0, EPOCH_US, true);
  return concat(
    encoder.encode("!NSG"),
    varint(xml.length),
    xml,
    frame(0, 0, epoch),
    ...events.map((item) => frame(53, item.elapsedUs, concat(Uint8Array.of(0x42), encoder.encode(JSON.stringify(item.data))))),
  );
}

function parse(events: NsgEvent[], mode: NsgParseMode = "complete") {
  const bytes = recording(events);
  const observed: NsgCell[] = [];
  const normalizedEvents: NsgEvent[] = [];
  const parser = new StreamDecoder(
    { name: "operators.log", size: bytes.length },
    { mode, onCell: (cell) => observed.push(cell), onEvent: (item) => normalizedEvents.push(structuredClone(item)) },
  );
  for (let offset = 0; offset < bytes.length; offset += 7) parser.push(bytes.subarray(offset, offset + 7));
  return { log: parser.finish(), observed, normalizedEvents, bytes };
}

void test("normalizes one canonical serving operator across cells, event JSON, CSV and analyzer without changing radio identity", async () => {
  const events = [service(0, 0), cells(1, 100)];
  const { log, observed, normalizedEvents, bytes } = parse(events);
  const cell = log.cells[0];
  assert.equal(cell.mnc, "02");
  assert.equal(cell.operatorName, "T-Mobile");
  assert.equal(getCellOperator(cell)?.name, "T-Mobile");
  assert.equal(cell.operatorName, "T-Mobile");
  assert.equal(getCellOperator(cell)?.name, "T-Mobile");
  assert.equal(cell.raw.mnc, "02");
  assert.strictEqual(cell.raw, (log.events[1].data.cells as NsgJsonObject[])[0]);
  assert.equal(observed[0].mnc, "02");
  assert.equal((normalizedEvents[1].data.cells as NsgJsonObject[])[0].mnc, "02");
  assert.deepEqual([cell.eci, cell.tac, cell.pci, cell.earfcn, cell.dbm], [61956130, 54201, 347, 3175, -90]);
  assert.equal(LTE.mnc, "03");
  const csv = createCellsCsv(log);
  assert.equal(csv.split("\r\n")[1].split(",")[9], "02");
  assert.ok(csv.includes(",T-Mobile,"));
  assert.ok(csv.includes('""mnc"":""02""'));
  assert.ok(!csv.includes('""mnc"":""03""'));
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const imported = await parseNsgAnalyzerStream(input, { name: "operators.log", size: bytes.length });
  assert.equal(imported.rows[0].mnc, 26002);
  assert.deepEqual(parse(events, "streaming").observed, observed);
});

void test("uses the registered network of each exact SIM pair, never subscription home or unrelated neighbor PLMNs", () => {
  const { log } = parse([
    event(0, 0, { event: "subscriptionsChanged", subscriptions: [{ simSlotIndex: 1, subscriptionId: 3, mcc: "222", mnc: "88" }] }),
    service(1, 1),
    service(2, 2, {
      slotId: 1,
      subId: 3,
      operator: "26006",
      "operator-long": "Play",
      networks: [{ registered: true, registeredPLMN: "26006", rat: 13 }],
    }),
    cells(3, 3, [LTE, { ...LTE, registered: false }, { ...LTE, registered: null }, { ...LTE, type: "GSM" }]),
    cells(4, 4, [LTE], 1, 3),
    cells(5, 5, [LTE], 0, 3),
  ]);
  assert.deepEqual(
    log.cells.map((cell) => cell.mnc),
    ["02", "03", "03", "03", "06", "03"],
  );
  assert.deepEqual(
    log.cells.map((cell) => cell.operatorName),
    ["T-Mobile", null, null, null, "Play", null],
  );
});

void test("never applies future state, including microsecond regressions and same-time event order", () => {
  const events = [
    service(0, 50, { operator: "26001", networks: [{ registered: true, registeredPLMN: "26001", rat: 13 }] }),
    service(1, 200),
    cells(2, 150),
    cells(3, 300),
  ];
  const retained = parse(events);
  const streaming = parse(events, "streaming");
  assert.deepEqual(
    retained.observed.map((cell) => cell.mnc),
    ["03", "02"],
  );
  assert.deepEqual(streaming.observed, retained.observed);
  const indexed = createOperatorResolver(retained.log.events);
  assert.equal(indexed.get(retained.observed[0])?.plmn, "26001");
  assert.equal(indexed.resolveCell(retained.observed[0])?.plmn, "26003");
  assert.equal(getCellOperator(retained.observed[0])?.plmn, "26003");
  const resolver = new StreamingOperatorState();
  resolver.process(service(5, 100));
  const context = { slotId: 0, subId: 2, rat: "LTE", elapsedUs: 100, eventIndex: 4 };
  assert.equal(resolver.get(context), null);
  assert.equal(resolver.get({ ...context, eventIndex: 6 })?.plmn, "26002");
});

void test("clears failed, missing, ambiguous and RAT-mismatched registration instead of reviving previous operator", () => {
  const invalidStates: NsgJsonObject[] = [
    { networks: [{ registered: false, registeredPLMN: "26002", rat: 13 }] },
    { networks: [] },
    { networks: null },
    { networks: [{ registered: true, registeredPLMN: "26002", rat: 18 }] },
    { networks: [{ registered: true, registeredPLMN: "26002", rat: 3 }] },
    {
      networks: [
        { registered: true, registeredPLMN: "26002", rat: 13 },
        { registered: true, registeredPLMN: "26003", rat: 13 },
      ],
    },
    { slotId: null, subId: 2 },
  ];
  for (const state of invalidStates) {
    const { log } = parse([service(0, 0), cells(1, 1), service(2, 2, state), cells(3, 3)]);
    assert.deepEqual(
      log.cells.map((cell) => cell.mnc),
      ["02", "03"],
    );
  }
});

void test("accepts confirmed packet registration despite voice state and associates a name only with its matching PLMN", () => {
  const resolver = new StreamingOperatorState();
  resolver.process(service(0, 0, { state: "no-service", networks: [{ registered: true, registeredPLMN: "26006", rat: 13 }] }));
  const result = resolver.get({ slotId: 0, subId: 2, rat: "LTE", elapsedUs: 1, eventIndex: 1 });
  assert.equal(result?.plmn, "26006");
  assert.equal(result?.name, null);
  resolver.process(service(2, 2, { networks: [{ registered: true, registeredPLMN: "", rat: 13 }] }));
  assert.equal(resolver.get({ slotId: 0, subId: 2, rat: "LTE", elapsedUs: 3, eventIndex: 3 })?.plmn, "26002");
});

void test("keeps change-driven state for unchanged subscriptions and clears removed, reassigned or changed-home pairs", () => {
  const subscription = { simSlotIndex: 0, subscriptionId: 2, mcc: "260", mnc: "02" };
  const subscriptions = (id: number, items: NsgJsonObject[]) => event(id, id * 1000000, { event: "subscriptionsChanged", subscriptions: items });
  const events = [subscriptions(0, [subscription]), service(1, 1), subscriptions(2, [subscription]), cells(3, 3 * 60 * 60 * 1000000)];
  assert.equal(parse(events).log.cells[0].mnc, "02");
  for (const next of [[], [{ ...subscription, subscriptionId: 4 }], [{ ...subscription, simSlotIndex: 1 }], [{ ...subscription, mnc: "03" }]]) {
    const { log } = parse([...events.slice(0, 3), subscriptions(3, next), cells(4, 4000000)]);
    assert.equal(log.cells[0].mnc, "03");
  }
});

void test("late older service records cannot revive a removed subscription or move a newer SIM pairing", () => {
  const removed = parse([event(0, 100, { event: "subscriptionsChanged", subscriptions: [] }), service(1, 50), cells(2, 150)]);
  assert.equal(removed.log.cells[0].mnc, "03");
  const moved = parse([service(0, 200, { slotId: 1 }), service(1, 100), cells(2, 300)]);
  assert.equal(moved.log.cells[0].mnc, "03");
  for (const missingContext of [{ subId: null }, { slotId: null }, { slotId: null, subId: null }]) {
    const { log } = parse([service(0, 100, missingContext), service(1, 50), cells(2, 150)]);
    assert.equal(log.cells[0].mnc, "03");
  }
});

void test("canonical PLMN formatting pads one-digit MNCs without aliasing genuine three-digit codes", () => {
  assert.equal(getCellOperator({ mcc: "260", mnc: "2" })?.plmn, "26002");
  assert.equal(getCellOperator({ mcc: "260", mnc: "002" })?.plmn, "260002");
  assert.equal(getCellOperator({ mcc: "260", mnc: "2", operatorName: "T-Mobile" })?.name, "T-Mobile");
  assert.equal(getCellOperator({ mcc: "260", mnc: "" }), null);
  assert.equal(getCellOperator({ mcc: null, mnc: "02" }), null);
});

void test("collects only registered phone operators for map station filtering", () => {
  assert.deepEqual(
    collectRegisteredOperatorMncs([
      { registered: true, mcc: "260", mnc: "02" },
      { registered: false, mcc: "260", mnc: "03" },
      { registered: null, mcc: "260", mnc: "01" },
      { registered: true, mcc: "260", mnc: "06" },
      { registered: true, mcc: "260", mnc: "2" },
      { registered: true, mcc: "260", mnc: "002" },
      { registered: true, mcc: null, mnc: "02" },
    ]),
    [26002, 26006, 260002],
  );
});
