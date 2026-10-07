import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCellIdentity,
  getCellIdentityFields,
  getCellMeasurementFields,
  getDisplayRat,
  getHeadlineSignal,
  getMobileSummaryFields,
  getReportedCellColumns,
  getSignalIdentityFields,
} from "../../src/components/nsg/cellPresentation";
import {
  createNrNonStandaloneAggregation,
  createNrNonStandalonePresentationSections,
  getNeighborTechnologySuffix,
  getNrNonStandaloneCarrierRoleAbbreviation,
  getNrNonStandaloneCarrierRoleLabelKey,
  isNrNonStandaloneAggregationCell,
} from "../../src/components/nsg/snapshotPresentation";
import { getInitialNsgTimelineMetric } from "../../src/components/nsg/timeline";
import type { NsgCell } from "../../src/lib/nsg-parser/model";

function cell(overrides: Partial<NsgCell> = {}): NsgCell {
  return {
    eventIndex: 0,
    timestampMs: 0,
    registered: true,
    cellIndex: 0,
    recordOffset: 0,
    elapsedUs: 0,
    timestampUs: "0",
    rat: "LTE",
    nrMode: null,
    sources: ["android-telephony"],
    subId: null,
    slotId: null,
    isDefaultSubscription: null,
    mcc: null,
    mnc: null,
    operatorName: null,
    lac: null,
    rnc: null,
    cid: null,
    tac: null,
    nci: null,
    gnbid: null,
    gnbidLength: null,
    clid: null,
    nrIdentitySource: null,
    eci: null,
    pci: null,
    earfcn: null,
    arfcn: null,
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: null,
    rssi: null,
    rsrp: null,
    rsrq: null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: null,
    raw: {},
    ...overrides,
  };
}

void test("prefers Qualcomm RSRP for fused NR headlines and keeps Android dBm as fallback", () => {
  const fused = cell({
    rat: "NR",
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    dbm: -82,
    rsrp: -110.8671875,
  });
  const withoutModemRsrp = cell({
    rat: "NR",
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    dbm: -96,
  });

  assert.deepEqual(getHeadlineSignal(fused), { value: -110.8671875, suffix: "dBm RSRP" });
  assert.deepEqual(getHeadlineSignal(withoutModemRsrp), { value: -96, suffix: "dBm" });
  assert.deepEqual(getHeadlineSignal(cell({ rat: "NR", dbm: -82, rsrp: -110 })), { value: -82, suffix: "dBm" });
});

void test("starts the timeline on modem RSRP only for Qualcomm-first NR cells", () => {
  const fusedNr = cell({
    rat: "NR",
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    dbm: -82,
    rsrp: -110.8671875,
  });

  assert.equal(getInitialNsgTimelineMetric([cell({ dbm: -91 }), fusedNr]), "rsrp");
  assert.equal(getInitialNsgTimelineMetric([cell({ rat: "NR", dbm: -82, rsrp: -110 })]), "dbm");
  assert.equal(getInitialNsgTimelineMetric([cell({ sources: ["qualcomm-diag"], dbm: -82, rsrp: -110 })]), "dbm");
  assert.equal(getInitialNsgTimelineMetric([cell({ ...fusedNr, rsrp: null })]), "dbm");
});

void test("uses explicit NR identity and channel fields", () => {
  const nr = cell({
    rat: "NR",
    tac: 7,
    nci: 123456,
    gnbid: 77,
    gnbidLength: 24,
    clid: 4,
    nrIdentitySource: "reported",
    pci: 123,
    arfcn: 640000,
    raw: { nci: 1, gnbid: 999, clid: 999 },
  });

  assert.equal(formatCellIdentity(nr), "NCI 123456 · ARFCN 640000");
  assert.deepEqual(
    getSignalIdentityFields(nr).map(({ label, value }) => [label, value]),
    [
      ["NCI", 123456],
      ["ARFCN", 640000],
    ],
  );
  assert.deepEqual(
    getReportedCellColumns("NR").map((column) => column.label),
    ["NCI", "PCI", "ARFCN", "RSRP", "RSRQ", "SINR"],
  );
  assert.deepEqual(
    getCellIdentityFields(nr).map(({ label, value }) => [label, value]),
    [
      ["TAC", 7],
      ["gNBID", 77],
      ["CLID", 4],
      ["NCI", 123456],
      ["PCI", 123],
      ["ARFCN", 640000],
    ],
  );
});

void test("marks the default 24-bit split while presenting exact typed NR identity", () => {
  const nr = cell({
    rat: "NR",
    nci: 6_461_599_761,
    gnbid: 1_577_539,
    gnbidLength: 24,
    clid: 17,
    nrIdentitySource: "derived-default-24",
  });
  const fields = Object.fromEntries(getCellIdentityFields(nr).map((field) => [field.key, field]));

  assert.deepEqual(fields.gnbid, {
    key: "gnbid",
    label: "gNBID",
    value: 1_577_539,
    hint: "derived-default-24",
  });
  assert.deepEqual(fields.clid, {
    key: "clid",
    label: "CLID",
    value: 17,
    hint: "derived-default-24",
  });
});

void test("formats identity-poor NSA measurements from PCI and ARFCN", () => {
  const nr = cell({
    rat: "NR",
    registered: null,
    measurementRole: "nr-primary",
    tac: 321,
    pci: 947,
    arfcn: 649920,
    ta: 8,
    raw: { source: "unrelated", diagLogCode: "0x0000", nci: 123456, gnbid: 77, clid: 4 },
  });

  assert.equal(formatCellIdentity(nr), "PCI 947 · ARFCN 649920");
  assert.deepEqual(
    getSignalIdentityFields(nr).map(({ label, value }) => [label, value]),
    [
      ["PCI", 947],
      ["ARFCN", 649920],
    ],
  );
  assert.deepEqual(
    getCellIdentityFields(nr).map((field) => field.label),
    ["PCI", "ARFCN"],
  );
  assert.deepEqual(
    getCellMeasurementFields(nr).map((field) => field.label),
    ["RSRP", "RSRQ", "RSSI", "SINR"],
  );
  assert.deepEqual(
    getMobileSummaryFields(nr).map((field) => field.label),
    ["PCI", "ARFCN", "RSRQ", "SINR"],
  );

  const neighbor = cell({
    rat: "NR",
    registered: false,
    measurementRole: "nr-neighbor",
    pci: 810,
    arfcn: 649920,
    raw: { nci: 654321 },
  });
  assert.deepEqual(
    getReportedCellColumns("NR", [neighbor]).map((column) => column.label),
    ["PCI", "ARFCN", "RSRP", "RSRQ", "SINR"],
  );
});

void test("omits unavailable NCI from SA neighbor tables", () => {
  const zero = cell({ rat: "NR", registered: false, nci: 0 });
  const unknownZero = cell({ rat: "NR", registered: null, raw: { nci: 0 } });

  assert.deepEqual(
    getReportedCellColumns("NR", [zero, unknownZero]).map((column) => column.label),
    ["PCI", "ARFCN", "RSRP", "RSRQ", "SINR"],
  );

  const reported = cell({ rat: "NR", registered: false, nci: 123456 });
  const columns = getReportedCellColumns("NR", [zero, reported]);
  const nciColumn = columns.find((column) => column.key === "nci");
  assert.ok(nciColumn);
  assert.deepEqual([nciColumn.getValue(zero), nciColumn.getValue(reported)], [null, 123456]);
});

void test("groups NSA serving and neighboring cells by carrier metadata", () => {
  const anchor = cell({ cellIndex: 0, measurementRole: "lte-secondary", pci: 7 });
  const carrierZeroServing = cell({
    cellIndex: 3,
    rat: "NR",
    registered: null,
    measurementRole: "nr-primary",
    pci: 101,
    raw: { carrierIndex: 0, carrierCellIndex: 0, ccId: 0 },
  });
  const carrierZeroNeighbor = cell({
    cellIndex: 1,
    rat: "NR",
    registered: false,
    measurementRole: "nr-neighbor",
    pci: 102,
    raw: { carrierIndex: 0, carrierCellIndex: 1, ccId: 0 },
  });
  const carrierOneServing = cell({
    cellIndex: 4,
    rat: "NR",
    registered: null,
    measurementRole: "nr-primary",
    pci: 201,
    raw: { carrierIndex: 1, carrierCellIndex: 0, ccId: 5 },
  });
  const carrierOneNeighbor = cell({
    cellIndex: 5,
    rat: "NR",
    registered: false,
    measurementRole: "nr-neighbor",
    pci: 202,
    raw: { carrierIndex: 1, carrierCellIndex: 1, ccId: 5 },
  });
  const carrierTwoNeighbor = cell({
    cellIndex: 2,
    rat: "NR",
    registered: false,
    measurementRole: "nr-neighbor",
    pci: 301,
    raw: { carrierIndex: 2, carrierCellIndex: 0, ccId: 6 },
  });

  const aggregation = createNrNonStandaloneAggregation([
    carrierOneNeighbor,
    carrierOneServing,
    carrierZeroNeighbor,
    anchor,
    carrierTwoNeighbor,
    carrierZeroServing,
  ]);

  assert.ok(aggregation);
  assert.deepEqual(aggregation.anchors, [anchor]);
  assert.deepEqual(
    aggregation.carriers.map((carrier) => ({
      carrierIndex: carrier.carrierIndex,
      role: carrier.role,
      serving: carrier.serving.map((entry) => entry.pci),
      neighbors: carrier.neighbors.map((entry) => entry.pci),
    })),
    [
      { carrierIndex: 0, role: "primary", serving: [101], neighbors: [102] },
      { carrierIndex: 1, role: "secondary", serving: [201], neighbors: [202] },
      { carrierIndex: 2, role: "secondary", serving: [], neighbors: [301] },
    ],
  );

  const sections = createNrNonStandalonePresentationSections(aggregation);
  assert.deepEqual(
    sections.map((section) => {
      switch (section.kind) {
        case "nr-serving":
          return {
            kind: section.kind,
            carrierKey: section.carrierKey,
            role: section.role,
            cells: [section.cell.pci],
            showRadioContext: section.showRadioContext,
          };
        case "nr-neighbors":
          return {
            kind: section.kind,
            carrierKey: section.carrierKey,
            role: section.role,
            cells: section.cells.map((entry) => entry.pci),
          };
        case "lte-anchor":
          return { kind: section.kind, cells: section.cells.map((entry) => entry.pci) };
      }
    }),
    [
      { kind: "nr-serving", carrierKey: "0", role: "primary", cells: [101], showRadioContext: true },
      { kind: "nr-serving", carrierKey: "1", role: "secondary", cells: [201], showRadioContext: false },
      { kind: "nr-neighbors", carrierKey: "0", role: "primary", cells: [102] },
      { kind: "nr-neighbors", carrierKey: "1", role: "secondary", cells: [202] },
      { kind: "nr-neighbors", carrierKey: "2", role: "secondary", cells: [301] },
      { kind: "lte-anchor", cells: [7] },
    ],
  );
  assert.equal(new Set(sections.map((section) => section.key)).size, sections.length);
});

void test("maps NSA carrier roles to stable PC, SC, and fallback translation keys", () => {
  assert.equal(getNrNonStandaloneCarrierRoleLabelKey("primary"), "snapshot.nrPrimaryCell");
  assert.equal(getNrNonStandaloneCarrierRoleLabelKey("secondary"), "snapshot.nrSecondaryCell");
  assert.equal(getNrNonStandaloneCarrierRoleLabelKey("unknown"), "snapshot.nrCell");
  assert.equal(getNrNonStandaloneCarrierRoleAbbreviation("primary"), "PC");
  assert.equal(getNrNonStandaloneCarrierRoleAbbreviation("secondary"), "SC");
  assert.equal(getNrNonStandaloneCarrierRoleAbbreviation("unknown"), null);
});

void test("shows known NR modes without repeating LTE and NR badge labels", () => {
  assert.equal(getNeighborTechnologySuffix("NR", "NSA"), "NSA");
  assert.equal(getNeighborTechnologySuffix("NR", "SA"), "SA");
  assert.equal(getNeighborTechnologySuffix("NR"), null);
  assert.equal(getNeighborTechnologySuffix("LTE"), null);
  assert.equal(getNeighborTechnologySuffix("LTE", "NSA"), null);
  assert.equal(getNeighborTechnologySuffix("WCDMA"), "WCDMA");
  assert.equal(getNeighborTechnologySuffix("SATELLITE"), "SATELLITE");
});

void test("keeps filtered NSA subsets and malformed carrier metadata safe", () => {
  const anchor = cell({ measurementRole: "lte-secondary" });
  const unknownCarrier = cell({
    rat: "NR",
    registered: null,
    measurementRole: "nr-primary",
    raw: { carrierIndex: "0", ccId: 1.5 },
  });
  const ordinaryNr = cell({ rat: "NR", raw: { carrierIndex: 0, ccId: 0 } });

  const anchorOnly = createNrNonStandaloneAggregation([anchor]);
  const nrOnly = createNrNonStandaloneAggregation([unknownCarrier]);

  assert.ok(anchorOnly);
  assert.deepEqual(anchorOnly.anchors, [anchor]);
  assert.deepEqual(anchorOnly.carriers, []);
  assert.ok(nrOnly);
  assert.equal(nrOnly.carriers[0].carrierIndex, null);
  assert.equal(nrOnly.carriers[0].role, "unknown");
  assert.strictEqual(nrOnly.carriers[0].serving[0], unknownCarrier);
  assert.equal(createNrNonStandaloneAggregation([ordinaryNr]), null);
  assert.equal(isNrNonStandaloneAggregationCell(anchor), true);
  assert.equal(isNrNonStandaloneAggregationCell(unknownCarrier), true);
  assert.equal(isNrNonStandaloneAggregationCell(ordinaryNr), false);
});

void test("preserves NCI presentation for identity-poor NR outside explicit NSA diagnostics", () => {
  const nr = cell({ rat: "NR", pci: 947, arfcn: 649920 });

  assert.equal(formatCellIdentity(nr), "NCI - · ARFCN 649920");
  assert.deepEqual(
    getSignalIdentityFields(nr).map(({ label, value }) => [label, value]),
    [
      ["NCI", null],
      ["ARFCN", 649920],
    ],
  );
});

void test("shows only CLID for reported LTE cells", () => {
  const reported = cell({ registered: false, eci: 123 * 256 + 7 });
  const [identityColumn] = getReportedCellColumns("LTE");

  assert.equal(identityColumn.label, "CLID");
  assert.equal(identityColumn.getValue(reported), 7);
  assert.deepEqual(
    getReportedCellColumns("LTE").map((column) => column.label),
    ["CLID", "PCI", "EARFCN", "RSRP", "RSRQ", "SINR"],
  );
  assert.deepEqual(
    getCellIdentityFields(reported)
      .slice(1, 3)
      .map((field) => field.label),
    ["eNBID", "CLID"],
  );
});

void test("uses neutral labels for unknown RATs and normalizes WCDMA presentation", () => {
  const unknown = cell({ rat: "SATELLITE", cid: 5, arfcn: 9 });

  assert.equal(formatCellIdentity(unknown), "ID 5 · Channel 9");
  assert.ok(getReportedCellColumns(unknown.rat).some((column) => column.label === "dBm"));
  assert.ok(getReportedCellColumns("WCDMA").some((column) => column.label === "Signal"));
  assert.deepEqual(
    getReportedCellColumns(unknown.rat)
      .slice(0, 3)
      .map((column) => column.label),
    ["ID", "PCI", "Channel"],
  );
  assert.equal(getDisplayRat("WCDMA"), "UMTS");
});

void test("uses UMTS signal metrics and preserves a zero Ec/No reading", () => {
  const umts = cell({ rat: "WCDMA", dbm: -101, rssi: -99, ecno: 0 });
  const ecnoOnly = cell({ rat: "UMTS", ecno: 0 });

  assert.deepEqual(
    getCellMeasurementFields(umts).map(({ label, value, unit }) => [label, value, unit]),
    [
      ["Signal", -101, "dBm"],
      ["Ec/No", 0, "dB"],
      ["RSSI", -99, "dBm"],
    ],
  );
  assert.deepEqual(getMobileSummaryFields(umts).at(-1), { key: "ecno", label: "Ec/No", value: 0, unit: "dB" });
  assert.deepEqual(getHeadlineSignal(umts), { value: -101, suffix: "dBm" });
  assert.deepEqual(getHeadlineSignal(ecnoOnly), { value: 0, suffix: "dB Ec/No" });
  assert.equal(getInitialNsgTimelineMetric([umts]), "dbm");
  assert.equal(getInitialNsgTimelineMetric([ecnoOnly]), "ecno");
  assert.deepEqual(
    getReportedCellColumns(umts.rat).map(({ label, unit }) => [label, unit]),
    [
      ["CID", undefined],
      ["PSC", undefined],
      ["UARFCN", undefined],
      ["Signal", "dBm"],
      ["RSSI", "dBm"],
      ["Ec/No", "dB"],
    ],
  );
});
