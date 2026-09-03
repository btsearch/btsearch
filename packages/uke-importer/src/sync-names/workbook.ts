import readline from "node:readline";
import XLSX from "xlsx";

import { parseCsvLine } from "../csv.js";
import type { FileSpec, GroupedMnoNames, MnoNameColumns, MnoNameConflict, ParsedMnoNames } from "./types.js";

function findMnoNameColumns(headerCells: string[]): MnoNameColumns | null {
  let stationId: number | undefined;
  let mnoName: number | undefined;

  for (let index = 0; index < headerCells.length; index++) {
    const header = (headerCells[index] ?? "").trim().toLowerCase();
    if (header === "id stacji") stationId = index;
    if (header === "nazwa stacji") mnoName = index;
  }

  if (stationId === undefined || mnoName === undefined) return null;
  return { stationId, mnoName };
}

function readFirstRow(sheet: XLSX.WorkSheet): string[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  range.e.r = range.s.r;

  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
    header: 1,
    range,
    blankrows: false,
    raw: false,
    defval: "",
  });
  const firstRow = rows[0];
  if (!firstRow) return [];

  return firstRow.map((cell) => String(cell ?? ""));
}

function findMnoWorksheet(workbook: XLSX.WorkBook): { sheet: XLSX.WorkSheet; sheetName: string; columns: MnoNameColumns } | null {
  const preferredNames = [workbook.SheetNames[1], ...workbook.SheetNames].filter((name): name is string => name !== undefined);
  const seen = new Set<string>();

  for (const sheetName of preferredNames) {
    if (seen.has(sheetName)) continue;
    seen.add(sheetName);

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const columns = findMnoNameColumns(readFirstRow(sheet));
    if (columns) return { sheet, sheetName, columns };
  }

  return null;
}

export async function readMnoNamesFromDeviceRegistryFile(spec: FileSpec): Promise<ParsedMnoNames> {
  const workbook = XLSX.readFile(spec.filePath, { dense: true });
  const worksheet = findMnoWorksheet(workbook);
  if (!worksheet) throw new Error(`Could not find "Id stacji" and "Nazwa stacji" columns in ${spec.filePath}`);

  const csvStream = XLSX.stream.to_csv(worksheet.sheet);
  const lines = readline.createInterface({ input: csvStream, crlfDelay: Number.POSITIVE_INFINITY });
  const stationMnoNames = new Map<string, string>();
  const conflicts: MnoNameConflict[] = [];
  let rowCount = 0;

  for await (const line of lines) {
    if (rowCount === 0) {
      rowCount++;
      continue;
    }

    rowCount++;
    const cells = parseCsvLine(line);
    if (cells.every((cell) => !cell || cell.trim() === "")) continue;

    const stationId = (cells[worksheet.columns.stationId] ?? "").trim();
    const mnoName = (cells[worksheet.columns.mnoName] ?? "").trim();
    if (!stationId || !mnoName) continue;

    const existing = stationMnoNames.get(stationId);
    if (existing === undefined) {
      stationMnoNames.set(stationId, mnoName);
      continue;
    }

    if (existing !== mnoName) conflicts.push({ stationId, first: existing, next: mnoName });
  }

  return {
    filePath: spec.filePath,
    operator: spec.operator,
    sheetName: worksheet.sheetName,
    rowCount: Math.max(rowCount - 1, 0),
    stationMnoNames,
    conflicts,
  };
}

export function mergeParsedNames(parsedFiles: ParsedMnoNames[]): Map<string, GroupedMnoNames> {
  const byOperator = new Map<string, GroupedMnoNames>();

  for (const parsed of parsedFiles) {
    const existing = byOperator.get(parsed.operator.name);
    const group = existing ?? { operator: parsed.operator, stationMnoNames: new Map<string, string>() };
    byOperator.set(parsed.operator.name, group);

    for (const [stationId, mnoName] of parsed.stationMnoNames) {
      if (!group.stationMnoNames.has(stationId)) group.stationMnoNames.set(stationId, mnoName);
    }
  }

  return byOperator;
}
