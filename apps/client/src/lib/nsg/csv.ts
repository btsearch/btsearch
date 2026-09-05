import { formatNsgTimestamp } from "./parser";
import type { NsgCell, NsgJsonValue, NsgLog } from "./types";

const CELL_FIELDS = [
  "type",
  "registered",
  "mcc",
  "mnc",
  "lac",
  "cid",
  "tac",
  "eci",
  "pci",
  "earfcn",
  "arfcn",
  "uarfcn",
  "psc",
  "bsic",
  "dbm",
  "rssi",
  "rsrp",
  "rsrq",
  "sinr",
  "ta",
  "ber",
] as const;
const COLUMNS = ["timestamp_utc", "elapsed_us", "subId", "slotId", "default", "cell_index", ...CELL_FIELDS, "record_offset", "raw_cell_json"];

function escapeCsv(value: NsgJsonValue | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = typeof value === "string" && (/^[=+@-]/.test(raw.trimStart()) || /^[\t\r\n]/.test(raw)) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function createNsgCellsCsv(log: NsgLog, cells: NsgCell[] = log.cells): string {
  const lines = [COLUMNS.join(",")];
  for (const cell of cells) {
    const event = log.events[cell.eventIndex];
    const values = [
      formatNsgTimestamp(cell.timestampUs),
      cell.elapsedUs,
      event.data.subId,
      event.data.slotId,
      event.data.default,
      cell.cellIndex,
      ...CELL_FIELDS.map((field) => cell.raw[field]),
      cell.recordOffset,
      cell.raw,
    ];
    lines.push(values.map(escapeCsv).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
