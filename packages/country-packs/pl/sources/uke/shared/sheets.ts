import type { LocalFile } from "../../../../core/sources.ts";
import { type SheetCell, type SheetCells, cellText, readSheetRows } from "./workbook.ts";

export type SheetValue = SheetCell["value"] | null;
export type SheetRow = Record<string, SheetValue>;
type SheetTable = { headers: string[]; rows: AsyncIterable<SheetRow> };

export function trimmedText(value: SheetValue): string {
  return String(value || "").trim();
}

export function trimmedTextOrNull(value: SheetValue): string | null {
  return trimmedText(value) || null;
}

export function untrimmedTextOrNull(value: SheetValue): string | null {
  return value ? String(value) : null;
}

export function missingColumnsError(file: LocalFile, columns: readonly string[]): Error {
  return new Error(`Workbook "${file.fileName}" is missing required columns: ${columns.map((column) => `"${column}"`).join(", ")}`);
}

function headerKeys(headerCells: readonly (SheetCell | undefined)[]): string[] {
  const counts = new Map<string, number>();
  return headerCells.map((cell) => {
    const key = cell === undefined ? "__EMPTY" : cell.text;
    let count = counts.get(key) ?? 0;
    if (count === 0) {
      counts.set(key, 1);
      return key;
    }

    let uniqueKey = `${key}_${count++}`;
    while (counts.has(uniqueKey)) uniqueKey = `${key}_${count++}`;
    counts.set(key, count);
    counts.set(uniqueKey, 1);
    return uniqueKey;
  });
}

function rawValue(cell: SheetCell | undefined): SheetValue {
  return cell === undefined || cell.type === "e" ? null : (cell.value ?? null);
}

async function* keyedRows(rows: AsyncIterable<SheetCells>, keys: readonly string[]): AsyncGenerator<SheetRow> {
  for await (const cells of rows) {
    const values = cells.map(rawValue);
    if (values.some((value) => value !== null)) yield Object.fromEntries(keys.slice(0, values.length).map((key, index) => [key, values[index]]));
  }
}

export async function readFirstSheet(
  file: LocalFile,
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
): Promise<SheetTable> {
  const width = { lastColumn: Number.POSITIVE_INFINITY };
  const rows = readSheetRows(file, 0, width);
  const headerRow = await rows.next();
  const headerCells = headerRow.done ? [] : headerRow.value;
  const headers = headerCells.map((cell) => (cell?.type === "e" ? "" : cellText(cell)));
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    await rows.return(undefined);
    throw missingColumnsError(file, missingColumns);
  }

  const keys = headerKeys(headerCells);
  const lastColumn = Math.max(...[...requiredColumns, ...optionalColumns].map((column) => keys.indexOf(column)));
  if (lastColumn >= 0) width.lastColumn = lastColumn;
  return { headers, rows: keyedRows(rows, keys) };
}
