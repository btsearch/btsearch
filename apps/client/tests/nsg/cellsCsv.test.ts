import assert from "node:assert/strict";
import test from "node:test";

import { createCellsCsv } from "../../src/features/nsg-explorer/export/cellsCsv";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import { mixedRecordingBytes } from "./fixtures/nsgContainer";

const LEGACY_HEADER =
  "timestamp_utc,elapsed_us,subId,slotId,default,cell_index,type,registered,mcc,mnc,lac,cid,tac,eci,pci,earfcn,arfcn,uarfcn,psc,bsic,dbm,rssi,rsrp,rsrq,sinr,ta,ber,record_offset,raw_cell_json";

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index++) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

void test("exports exact source measurements and quoted raw details to CSV", () => {
  const log = parseRecording(mixedRecordingBytes());
  const csv = createCellsCsv(log, [log.cells[0]]);
  assert.equal(csv.split("\r\n")[0], `\uFEFF${LEGACY_HEADER},nci,bands,operator_name,gnbid,gnbid_length,clid,nr_identity_source`);
  assert.ok(csv.includes("2026-09-05T13:14:19.451374Z,1234567,2,0,false,0,lte,true,260,03"));
  assert.ok(csv.includes('""extra"":""Zażółć, test""'));
  assert.equal(csv.split("\r\n").length, 3);
});

void test("exports formula-like text as text while retaining negative numeric measurements", () => {
  const log = parseRecording(mixedRecordingBytes());
  log.cells[0].raw.type = " -1+2";
  const csv = createCellsCsv(log, [log.cells[0]]);
  assert.ok(csv.includes(",0,' -1+2,true,260,03,"));
  assert.ok(csv.includes(",-90,-11,0,0,"));
});

void test("exports canonical fused NR fields while retaining raw Android provenance", () => {
  const log = parseRecording(mixedRecordingBytes());
  const cell = log.cells[0];
  cell.rat = "NR";
  cell.nci = 6_461_599_761;
  cell.operatorName = "YES OPTUS";
  cell.gnbid = 1_577_539;
  cell.gnbidLength = 24;
  cell.clid = 17;
  cell.nrIdentitySource = "derived-default-24";
  cell.arfcn = 473_290;
  cell.bands = [40, 78];
  cell.dbm = -101;
  cell.rssi = -102;
  cell.rsrp = -110.5;
  cell.rsrq = -12.5;
  cell.sinr = 8.25;
  cell.raw.nci = 1;
  cell.raw.arfcn = 2;
  cell.raw.bands = [1];
  cell.raw.dbm = -80;
  cell.raw.rssi = -81;

  const [header, row] = createCellsCsv(log, [cell]).split("\r\n");
  const columns = header.replace(/^\uFEFF/, "").split(",");
  const values = parseCsvRow(row);
  const exported = Object.fromEntries(columns.map((column, index) => [column, values[index]]));

  assert.equal(exported.nci, "6461599761");
  assert.equal(exported.operator_name, "YES OPTUS");
  assert.equal(exported.gnbid, "1577539");
  assert.equal(exported.gnbid_length, "24");
  assert.equal(exported.clid, "17");
  assert.equal(exported.nr_identity_source, "derived-default-24");
  assert.equal(exported.arfcn, "473290");
  assert.equal(exported.bands, "[40,78]");
  assert.equal(exported.dbm, "-101");
  assert.equal(exported.rssi, "-102");
  assert.equal(exported.rsrp, "-110.5");
  assert.equal(exported.rsrq, "-12.5");
  assert.equal(exported.sinr, "8.25");
  assert.deepEqual(JSON.parse(exported.raw_cell_json), cell.raw);
});

void test("leaves NR-only identity columns empty for unrelated RATs", () => {
  const log = parseRecording(mixedRecordingBytes());
  const [header, row] = createCellsCsv(log, [log.cells[0]]).split("\r\n");
  const columns = header.replace(/^\uFEFF/, "").split(",");
  const values = parseCsvRow(row);
  const exported = Object.fromEntries(columns.map((column, index) => [column, values[index]]));

  assert.equal(exported.gnbid, "");
  assert.equal(exported.gnbid_length, "");
  assert.equal(exported.clid, "");
  assert.equal(exported.nr_identity_source, "");
});
