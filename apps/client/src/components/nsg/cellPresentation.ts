import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import type { NsgCell } from "@/lib/nsg/types";

import { formatValue } from "./display";

export type DisplayValue = number | string | null;

export type DisplayField = Readonly<{
  key: string;
  label: string;
  value: DisplayValue;
  unit?: string;
}>;

export type TableColumn = Readonly<{
  key: string;
  label: string;
  unit?: string;
  getValue: (cell: NsgCell) => DisplayValue;
}>;

type RatFamily = "gsm" | "umts" | "lte" | "nr" | "other";

const MAX_LTE_ECI = 268_435_455;

function getRatFamily(rat: string): RatFamily {
  if (rat === "GSM") return "gsm";
  if (rat === "UMTS" || rat === "WCDMA") return "umts";
  if (rat === "LTE") return "lte";
  if (rat === "NR") return "nr";
  return "other";
}

export function isNrNsaCell(cell: NsgCell): boolean {
  return getRatFamily(cell.rat) === "nr" && (cell.measurementRole === "nr-primary" || cell.measurementRole === "nr-neighbor");
}

export function getDisplayRat(rat: string): string {
  return rat === "WCDMA" ? "UMTS" : rat;
}

function getValidLteIdentity(cell: NsgCell): number | null {
  return cell.eci !== null && cell.eci >= 0 && cell.eci <= MAX_LTE_ECI ? cell.eci : null;
}

function getRawNumber(cell: NsgCell, key: string): number | null {
  const value = cell.raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNrTac(cell: NsgCell): number | null {
  return getRawNumber(cell, "nrtac") ?? cell.tac;
}

function getNrIdentity(cell: NsgCell): number | null {
  return getRawNumber(cell, "nci");
}

function getGenericIdentity(cell: NsgCell): number | null {
  return getRawNumber(cell, "nci") ?? cell.eci ?? cell.cid;
}

function getGenericChannel(cell: NsgCell): number | null {
  return cell.earfcn ?? cell.uarfcn ?? cell.arfcn;
}

function identityField(cell: NsgCell, key: string, value: number | null): DisplayField {
  return { key, label: getRatDetailFieldLabel(getDisplayRat(cell.rat), key, "station"), value };
}

export function formatCellIdentity(cell: NsgCell): string {
  const family = getRatFamily(cell.rat);
  if (family === "lte") {
    const identity = getValidLteIdentity(cell);
    const enbid = identity === null ? null : Math.floor(identity / 256);
    const clid = identity === null ? null : identity % 256;
    return `eNBID ${formatValue(enbid)} · CLID ${formatValue(clid)}`;
  }
  if (family === "gsm") return `CID ${formatValue(cell.cid)} · ARFCN ${formatValue(cell.arfcn)}`;
  if (family === "umts") return `CID ${formatValue(cell.cid)} · UARFCN ${formatValue(cell.uarfcn)}`;
  if (family === "nr") {
    const identity = getNrIdentity(cell);
    if (isNrNsaCell(cell)) return `PCI ${formatValue(cell.pci)} · ARFCN ${formatValue(cell.arfcn)}`;
    return `NCI ${formatValue(identity)} · ARFCN ${formatValue(cell.arfcn)}`;
  }
  return `ID ${formatValue(getGenericIdentity(cell))} · Channel ${formatValue(getGenericChannel(cell))}`;
}

export function getCellIdentityFields(cell: NsgCell): readonly DisplayField[] {
  const family = getRatFamily(cell.rat);
  if (family === "lte") {
    const identity = getValidLteIdentity(cell);
    return [
      identityField(cell, "tac", cell.tac),
      identityField(cell, "enbid", identity === null ? null : Math.floor(identity / 256)),
      identityField(cell, "clid", identity === null ? null : identity % 256),
      identityField(cell, "ecid", cell.eci),
      identityField(cell, "pci", cell.pci),
      identityField(cell, "earfcn", cell.earfcn),
    ];
  }
  if (family === "gsm")
    return [
      identityField(cell, "lac", cell.lac),
      identityField(cell, "cid", cell.cid),
      identityField(cell, "arfcn", cell.arfcn),
      identityField(cell, "bsic", cell.bsic),
    ];
  if (family === "umts")
    return [
      identityField(cell, "lac", cell.lac),
      identityField(cell, "cid", cell.cid),
      identityField(cell, "uarfcn", cell.uarfcn),
      identityField(cell, "psc", cell.psc),
    ];
  if (family === "nr") {
    if (isNrNsaCell(cell)) return [identityField(cell, "pci", cell.pci), identityField(cell, "arfcn", cell.arfcn)];
    return [
      identityField(cell, "nrtac", getNrTac(cell)),
      identityField(cell, "gnbid", getRawNumber(cell, "gnbid")),
      identityField(cell, "clid", getRawNumber(cell, "clid")),
      identityField(cell, "nci", getNrIdentity(cell)),
      identityField(cell, "pci", cell.pci),
      identityField(cell, "arfcn", cell.arfcn),
    ];
  }
  return [
    { key: "area", label: "Area", value: cell.tac ?? cell.lac },
    { key: "identity", label: "Cell ID", value: getGenericIdentity(cell) },
    { key: "pci", label: "PCI", value: cell.pci },
    { key: "channel", label: "Channel", value: getGenericChannel(cell) },
  ];
}

export function getCellMeasurementFields(cell: NsgCell): readonly DisplayField[] {
  const fields: DisplayField[] = [
    { key: "rsrp", label: "RSRP", value: cell.rsrp, unit: "dBm" },
    { key: "rsrq", label: "RSRQ", value: cell.rsrq, unit: "dB" },
    { key: "rssi", label: "RSSI", value: cell.rssi, unit: "dBm" },
    { key: "sinr", label: "SINR", value: cell.sinr },
  ];
  if (!isNrNsaCell(cell)) fields.push({ key: "ta", label: "TA", value: cell.ta });
  if (getRatFamily(cell.rat) === "gsm") fields.push({ key: "ber", label: "BER", value: cell.ber });
  return fields;
}

export function getMobileSummaryFields(cell: NsgCell): readonly DisplayField[] {
  const family = getRatFamily(cell.rat);
  if (family === "lte") {
    const identity = getValidLteIdentity(cell);
    return [
      identityField(cell, "tac", cell.tac),
      identityField(cell, "enbid", identity === null ? null : Math.floor(identity / 256)),
      identityField(cell, "clid", identity === null ? null : identity % 256),
      identityField(cell, "pci", cell.pci),
      identityField(cell, "earfcn", cell.earfcn),
      { key: "rsrq", label: "RSRQ", value: cell.rsrq, unit: "dB" },
      { key: "sinr", label: "SINR", value: cell.sinr },
      { key: "ta", label: "TA", value: cell.ta },
    ];
  }
  if (family === "gsm") return getCellIdentityFields(cell);
  if (family === "umts") return getCellIdentityFields(cell);
  if (family === "nr") {
    if (isNrNsaCell(cell))
      return [
        identityField(cell, "pci", cell.pci),
        identityField(cell, "arfcn", cell.arfcn),
        { key: "rsrq", label: "RSRQ", value: cell.rsrq, unit: "dB" },
        { key: "sinr", label: "SINR", value: cell.sinr },
      ];
    return [
      identityField(cell, "nrtac", getNrTac(cell)),
      identityField(cell, "nci", getNrIdentity(cell)),
      identityField(cell, "pci", cell.pci),
      identityField(cell, "arfcn", cell.arfcn),
      { key: "rsrq", label: "RSRQ", value: cell.rsrq, unit: "dB" },
      { key: "sinr", label: "SINR", value: cell.sinr },
      { key: "ta", label: "TA", value: cell.ta },
    ];
  }
  return [
    { key: "rssi", label: "RSSI", value: cell.rssi, unit: "dBm" },
    { key: "rsrp", label: "RSRP", value: cell.rsrp, unit: "dBm" },
    { key: "rsrq", label: "RSRQ", value: cell.rsrq, unit: "dB" },
    { key: "sinr", label: "SINR", value: cell.sinr },
  ];
}

export function getSignalIdentityFields(cell: NsgCell): readonly DisplayField[] {
  const family = getRatFamily(cell.rat);
  if (family === "lte") return [identityField(cell, "ecid", cell.eci), identityField(cell, "earfcn", cell.earfcn)];
  if (family === "gsm") return [identityField(cell, "cid", cell.cid), identityField(cell, "arfcn", cell.arfcn)];
  if (family === "umts") return [identityField(cell, "cid", cell.cid), identityField(cell, "uarfcn", cell.uarfcn)];
  if (family === "nr") {
    const identity = getNrIdentity(cell);
    if (isNrNsaCell(cell)) return [identityField(cell, "pci", cell.pci), identityField(cell, "arfcn", cell.arfcn)];
    return [identityField(cell, "nci", identity), identityField(cell, "arfcn", cell.arfcn)];
  }
  return [
    { key: "identity", label: "Cell ID", value: getGenericIdentity(cell) },
    { key: "channel", label: "Channel", value: getGenericChannel(cell) },
  ];
}

export function getReportedCellColumns(rat: string, sample?: NsgCell): readonly TableColumn[] {
  const family = getRatFamily(rat);
  if (family === "lte")
    return [
      {
        key: "clid",
        label: "CLID",
        getValue(cell) {
          const identity = getValidLteIdentity(cell);
          return identity === null ? null : identity % 256;
        },
      },
      { key: "pci", label: "PCI", getValue: (cell) => cell.pci },
      { key: "earfcn", label: "EARFCN", getValue: (cell) => cell.earfcn },
      { key: "rsrp", label: "RSRP", unit: "dBm", getValue: (cell) => cell.rsrp },
      { key: "rsrq", label: "RSRQ", unit: "dB", getValue: (cell) => cell.rsrq },
      { key: "sinr", label: "SINR", getValue: (cell) => cell.sinr },
    ];
  if (family === "gsm")
    return [
      { key: "cid", label: "CID", getValue: (cell) => cell.cid },
      { key: "bsic", label: "BSIC", getValue: (cell) => cell.bsic },
      { key: "arfcn", label: "ARFCN", getValue: (cell) => cell.arfcn },
      { key: "dbm", label: "dBm", getValue: (cell) => cell.dbm },
      { key: "rssi", label: "RSSI", unit: "dBm", getValue: (cell) => cell.rssi },
      { key: "ber", label: "BER", getValue: (cell) => cell.ber },
    ];
  if (family === "umts")
    return [
      { key: "cid", label: "CID", getValue: (cell) => cell.cid },
      { key: "psc", label: "PSC", getValue: (cell) => cell.psc },
      { key: "uarfcn", label: "UARFCN", getValue: (cell) => cell.uarfcn },
      { key: "dbm", label: "dBm", getValue: (cell) => cell.dbm },
      { key: "rssi", label: "RSSI", unit: "dBm", getValue: (cell) => cell.rssi },
      { key: "ta", label: "TA", getValue: (cell) => cell.ta },
    ];
  if (family === "nr") {
    if (sample && isNrNsaCell(sample))
      return [
        { key: "pci", label: "PCI", getValue: (cell) => cell.pci },
        { key: "arfcn", label: "ARFCN", getValue: (cell) => cell.arfcn },
        { key: "rsrp", label: "RSRP", unit: "dBm", getValue: (cell) => cell.rsrp },
        { key: "rsrq", label: "RSRQ", unit: "dB", getValue: (cell) => cell.rsrq },
        { key: "sinr", label: "SINR", getValue: (cell) => cell.sinr },
      ];
    return [
      { key: "nci", label: "NCI", getValue: getNrIdentity },
      { key: "pci", label: "PCI", getValue: (cell) => cell.pci },
      { key: "arfcn", label: "ARFCN", getValue: (cell) => cell.arfcn },
      { key: "rsrp", label: "RSRP", unit: "dBm", getValue: (cell) => cell.rsrp },
      { key: "rsrq", label: "RSRQ", unit: "dB", getValue: (cell) => cell.rsrq },
      { key: "sinr", label: "SINR", getValue: (cell) => cell.sinr },
    ];
  }
  return [
    { key: "identity", label: "ID", getValue: getGenericIdentity },
    { key: "pci", label: "PCI", getValue: (cell) => cell.pci },
    { key: "channel", label: "Channel", getValue: getGenericChannel },
    { key: "dbm", label: "dBm", getValue: (cell) => cell.dbm },
    { key: "rssi", label: "RSSI", unit: "dBm", getValue: (cell) => cell.rssi },
    { key: "rsrp", label: "RSRP", unit: "dBm", getValue: (cell) => cell.rsrp },
    { key: "sinr", label: "SINR", getValue: (cell) => cell.sinr },
  ];
}
