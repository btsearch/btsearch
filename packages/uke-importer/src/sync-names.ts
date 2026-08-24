import { extraIdentificators, operators, stations } from "@openbts/drizzle";
import { db, sql as dbClient } from "@openbts/drizzle/db";
import { and, eq, inArray } from "drizzle-orm/sql/expressions/conditions";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import XLSX from "xlsx";

import { BATCH_SIZE, PERMIT_FILE_OPERATOR_MAP } from "./config.ts";
import { chunk, createLogger } from "./utils.ts";

const logger = createLogger("device-registry-mno-name-sync");
const PREVIEW_LIMIT = 25;

interface OperatorSpec {
  key: string;
  name: string;
}

interface FileSpec {
  filePath: string;
  operator: OperatorSpec;
}

interface CliOptions {
  apply: boolean;
  files: FileSpec[];
}

interface MnoNameColumns {
  stationId: number;
  mnoName: number;
}

interface ParsedMnoNames {
  filePath: string;
  operator: OperatorSpec;
  sheetName: string;
  rowCount: number;
  stationMnoNames: Map<string, string>;
  conflicts: Array<{ stationId: string; first: string; next: string }>;
}

interface TargetMnoName {
  stationPk: number;
  stationId: string;
  mnoName: string;
}

interface ExistingExtraIdentifier {
  id: number;
  station_id: number;
  mno_name: string | null;
}

interface PlannedChange {
  stationPk: number;
  stationId: string;
  oldMnoName: string | null;
  newMnoName: string;
  action: "insert" | "update";
}

interface OperatorPlan {
  operator: OperatorSpec;
  operatorId: number;
  inputStationCount: number;
  matchedStationCount: number;
  missingStationIds: string[];
  unchangedCount: number;
  inserts: TargetMnoName[];
  updates: Array<TargetMnoName & { extraIdentifierIds: number[]; oldMnoName: string | null }>;
  preview: PlannedChange[];
}

function usage(): string {
  return [
    "Usage:",
    "  pnpm --filter @openbts/uke-importer sync:mno-names -- [--apply] <operator=file.xlsx|file.xlsx|directory>",
    "",
    "Examples:",
    "  pnpm --filter @openbts/uke-importer sync:mno-names -- orange=C:\\Downloads\\2026-07-06_orange.xlsx",
    "  pnpm --filter @openbts/uke-importer sync:mno-names -- --apply orange=C:\\Downloads\\2026-07-06_orange.xlsx",
    "  pnpm --filter @openbts/uke-importer sync:mno-names -- --apply C:\\Downloads\\2026-07-06_orange.xlsx C:\\Downloads\\2026-07-06_p4.xlsx",
    "",
    "Known operator keys: orange, p4, t-mobile, polkomtel",
    "Without --apply the script only prints the planned inserts/updates.",
  ].join("\n");
}

function normalizeOperatorToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function compactOperatorToken(value: string): string {
  return normalizeOperatorToken(value).replace(/[^a-z0-9]+/g, "");
}

function resolveOperator(value: string): OperatorSpec | null {
  const normalized = normalizeOperatorToken(value);
  const directName = PERMIT_FILE_OPERATOR_MAP[normalized];
  if (directName) return { key: normalized, name: directName };

  for (const [key, name] of Object.entries(PERMIT_FILE_OPERATOR_MAP)) {
    if (normalizeOperatorToken(name) === normalized) return { key, name };
  }

  return null;
}

function inferOperatorFromPath(filePath: string): OperatorSpec | null {
  const basename = path.basename(filePath).toLowerCase();
  const normalizedBasename = basename.replace(/[^a-z0-9]+/g, "-");
  const compactBasename = basename.replace(/[^a-z0-9]+/g, "");

  for (const [key, name] of Object.entries(PERMIT_FILE_OPERATOR_MAP)) {
    if (normalizedBasename.includes(key) || compactBasename.includes(compactOperatorToken(key))) return { key, name };
  }

  return null;
}

function expandInputPath(inputPath: string): string[] {
  const resolvedPath = path.resolve(inputPath);
  if (!existsSync(resolvedPath)) throw new Error(`Input path does not exist: ${inputPath}`);

  const stat = statSync(resolvedPath);
  if (!stat.isDirectory()) return [resolvedPath];

  return readdirSync(resolvedPath)
    .filter((entry) => entry.toLowerCase().endsWith(".xlsx"))
    .map((entry) => path.join(resolvedPath, entry))
    .sort((a, b) => a.localeCompare(b));
}

function parseFileSpec(rawSpec: string, fallbackOperator: OperatorSpec | null): FileSpec[] {
  const eqIndex = rawSpec.indexOf("=");
  let operator = fallbackOperator;
  let inputPath = rawSpec;

  if (eqIndex > 0) {
    const operatorToken = rawSpec.slice(0, eqIndex);
    const explicitOperator = resolveOperator(operatorToken);
    if (!explicitOperator) throw new Error(`Unknown operator "${operatorToken}" in "${rawSpec}"`);
    operator = explicitOperator;
    inputPath = rawSpec.slice(eqIndex + 1);
  }

  if (!inputPath) throw new Error(`Missing file path in "${rawSpec}"`);

  return expandInputPath(inputPath).map((filePath) => {
    const inferredOperator = operator ?? inferOperatorFromPath(filePath);
    if (!inferredOperator) throw new Error(`Cannot infer operator for ${filePath}. Use operator=${filePath}`);
    return { filePath, operator: inferredOperator };
  });
}

function parseCliArgs(args: string[]): CliOptions {
  let apply = false;
  let fallbackOperator: OperatorSpec | null = null;
  const files: FileSpec[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      apply = false;
      continue;
    }

    if (arg === "--operator" || arg === "-o") {
      const operatorToken = args[i + 1];
      if (!operatorToken) throw new Error(`${arg} requires an operator key`);
      fallbackOperator = resolveOperator(operatorToken);
      if (!fallbackOperator) throw new Error(`Unknown operator "${operatorToken}"`);
      i++;
      continue;
    }

    if (arg.startsWith("--operator=")) {
      const operatorToken = arg.slice("--operator=".length);
      fallbackOperator = resolveOperator(operatorToken);
      if (!fallbackOperator) throw new Error(`Unknown operator "${operatorToken}"`);
      continue;
    }

    files.push(...parseFileSpec(arg, fallbackOperator));
  }

  if (files.length === 0) throw new Error(`No device registry files provided.\n\n${usage()}`);
  return { apply, files };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') inQuotes = false;
      else current += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") {
      result.push(current);
      current = "";
    } else current += char;
  }

  result.push(current);
  return result;
}

function findMnoNameColumns(headerCells: string[]): MnoNameColumns | null {
  const columns: Partial<MnoNameColumns> = {};

  for (let i = 0; i < headerCells.length; i++) {
    const header = (headerCells[i] ?? "").trim().toLowerCase();
    if (header === "id stacji") columns.stationId = i;
    if (header === "nazwa stacji") columns.mnoName = i;
  }

  if (columns.stationId === undefined || columns.mnoName === undefined) return null;
  return columns as MnoNameColumns;
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

async function readMnoNamesFromDeviceRegistryFile(spec: FileSpec): Promise<ParsedMnoNames> {
  const workbook = XLSX.readFile(spec.filePath, { dense: true });
  const worksheet = findMnoWorksheet(workbook);
  if (!worksheet) throw new Error(`Could not find "Id stacji" and "Nazwa stacji" columns in ${spec.filePath}`);

  const csvStream = XLSX.stream.to_csv(worksheet.sheet);
  const lines = readline.createInterface({ input: csvStream, crlfDelay: Number.POSITIVE_INFINITY });
  const stationMnoNames = new Map<string, string>();
  const conflicts: Array<{ stationId: string; first: string; next: string }> = [];
  let rowCount = 0;

  for await (const line of lines) {
    if (rowCount === 0) {
      rowCount++;
      continue;
    }

    rowCount++;
    const cells = parseCSVLine(line);
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

async function loadOperatorIds(files: FileSpec[]): Promise<Map<string, number>> {
  const operatorNames = Array.from(new Set(files.map((file) => file.operator.name)));
  const rows = await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.name, operatorNames));
  return new Map(rows.map((row) => [row.name, row.id]));
}

function mergeParsedNames(parsedFiles: ParsedMnoNames[]): Map<string, { operator: OperatorSpec; stationMnoNames: Map<string, string> }> {
  const byOperator = new Map<string, { operator: OperatorSpec; stationMnoNames: Map<string, string> }>();

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

async function findMatchingStations(operatorId: number, stationIds: string[]): Promise<Array<{ id: number; station_id: string }>> {
  const rows: Array<{ id: number; station_id: string }> = [];

  for (const stationIdGroup of chunk(stationIds, BATCH_SIZE)) {
    const groupRows = await db
      .select({ id: stations.id, station_id: stations.station_id })
      .from(stations)
      .where(and(eq(stations.operator_id, operatorId), inArray(stations.station_id, stationIdGroup)));
    rows.push(...groupRows);
  }

  return rows;
}

async function loadExistingExtraIdentifiers(stationPks: number[]): Promise<ExistingExtraIdentifier[]> {
  const rows: ExistingExtraIdentifier[] = [];

  for (const stationPkGroup of chunk(stationPks, BATCH_SIZE)) {
    const groupRows = await db
      .select({ id: extraIdentificators.id, station_id: extraIdentificators.station_id, mno_name: extraIdentificators.mno_name })
      .from(extraIdentificators)
      .where(inArray(extraIdentificators.station_id, stationPkGroup));
    rows.push(...groupRows);
  }

  return rows;
}

async function buildOperatorPlan(operator: OperatorSpec, operatorId: number, stationMnoNames: Map<string, string>): Promise<OperatorPlan> {
  const stationIds = Array.from(stationMnoNames.keys());
  const matchingStations = await findMatchingStations(operatorId, stationIds);
  const matchedStationIds = new Set(matchingStations.map((station) => station.station_id));
  const missingStationIds = stationIds.filter((stationId) => !matchedStationIds.has(stationId));

  const targets: TargetMnoName[] = matchingStations
    .map((station) => {
      const mnoName = stationMnoNames.get(station.station_id);
      if (mnoName === undefined) return null;
      return { stationPk: station.id, stationId: station.station_id, mnoName };
    })
    .filter((target): target is TargetMnoName => target !== null);

  const existingRows = await loadExistingExtraIdentifiers(targets.map((target) => target.stationPk));
  const existingByStationPk = new Map<number, ExistingExtraIdentifier[]>();
  for (const row of existingRows) {
    const rows = existingByStationPk.get(row.station_id) ?? [];
    rows.push(row);
    existingByStationPk.set(row.station_id, rows);
  }

  const inserts: TargetMnoName[] = [];
  const updates: Array<TargetMnoName & { extraIdentifierIds: number[]; oldMnoName: string | null }> = [];
  let unchangedCount = 0;

  for (const target of targets) {
    const existing = existingByStationPk.get(target.stationPk) ?? [];
    if (existing.length === 0) {
      inserts.push(target);
      continue;
    }

    const changedRows = existing.filter((row) => row.mno_name !== target.mnoName);
    if (changedRows.length === 0) {
      unchangedCount++;
      continue;
    }

    updates.push({
      ...target,
      extraIdentifierIds: changedRows.map((row) => row.id),
      oldMnoName: changedRows[0]?.mno_name ?? null,
    });
  }

  const preview: PlannedChange[] = [
    ...inserts.map((target) => ({
      stationPk: target.stationPk,
      stationId: target.stationId,
      oldMnoName: null,
      newMnoName: target.mnoName,
      action: "insert" as const,
    })),
    ...updates.map((target) => ({
      stationPk: target.stationPk,
      stationId: target.stationId,
      oldMnoName: target.oldMnoName,
      newMnoName: target.mnoName,
      action: "update" as const,
    })),
  ].slice(0, PREVIEW_LIMIT);

  return {
    operator,
    operatorId,
    inputStationCount: stationIds.length,
    matchedStationCount: matchingStations.length,
    missingStationIds,
    unchangedCount,
    inserts,
    updates,
    preview,
  };
}

async function applyOperatorPlan(plan: OperatorPlan): Promise<void> {
  const now = new Date();

  for (const insertGroup of chunk(plan.inserts, BATCH_SIZE)) {
    await db.insert(extraIdentificators).values(
      insertGroup.map((target) => ({
        station_id: target.stationPk,
        mno_name: target.mnoName,
      })),
    );
  }

  for (const updateGroup of chunk(plan.updates, BATCH_SIZE)) {
    await Promise.all(
      updateGroup.map((target) =>
        db
          .update(extraIdentificators)
          .set({ mno_name: target.mnoName, updatedAt: now })
          .where(inArray(extraIdentificators.id, target.extraIdentifierIds)),
      ),
    );
  }
}

function logParsedFiles(parsedFiles: ParsedMnoNames[]): void {
  for (const parsed of parsedFiles) {
    logger.log(
      `${parsed.operator.name}: ${path.basename(parsed.filePath)} (${parsed.sheetName}) -> ${parsed.stationMnoNames.size} station names from ${parsed.rowCount} rows`,
    );

    if (parsed.conflicts.length > 0) {
      logger.warn(`${parsed.operator.name}: ${parsed.conflicts.length} duplicate station ids had conflicting names; kept first value`);
      for (const conflict of parsed.conflicts.slice(0, PREVIEW_LIMIT)) {
        logger.warn(`  ${conflict.stationId}: "${conflict.first}" vs "${conflict.next}"`);
      }
    }
  }
}

function logOperatorPlan(plan: OperatorPlan): void {
  logger.log(
    [
      `${plan.operator.name}:`,
      `${plan.inputStationCount} names from files`,
      `${plan.matchedStationCount} matched internal stations`,
      `${plan.inserts.length} inserts`,
      `${plan.updates.length} updates`,
      `${plan.unchangedCount} unchanged`,
      `${plan.missingStationIds.length} missing internal stations`,
    ].join(" "),
  );

  for (const change of plan.preview) {
    logger.log(`  ${change.action} ${change.stationId}: ${change.oldMnoName ?? "-"} -> ${change.newMnoName}`);
  }

  if (plan.preview.length === PREVIEW_LIMIT) logger.log(`  ...preview limited to ${PREVIEW_LIMIT} changes`);
  if (plan.missingStationIds.length > 0) logger.warn(`  missing sample: ${plan.missingStationIds.slice(0, PREVIEW_LIMIT).join(", ")}`);
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (!options.apply) logger.warn("Dry run only. Re-run with --apply to write changes.");

  const operatorIds = await loadOperatorIds(options.files);
  const missingOperators = options.files
    .map((file) => file.operator.name)
    .filter((name, index, names) => !operatorIds.has(name) && names.indexOf(name) === index);
  if (missingOperators.length > 0) throw new Error(`Operators not found in database: ${missingOperators.join(", ")}`);

  const parsedFiles = await Promise.all(options.files.map((file) => readMnoNamesFromDeviceRegistryFile(file)));
  logParsedFiles(parsedFiles);

  const grouped = mergeParsedNames(parsedFiles);
  const plans: OperatorPlan[] = [];
  for (const { operator, stationMnoNames } of grouped.values()) {
    const operatorId = operatorIds.get(operator.name);
    if (operatorId === undefined) throw new Error(`Operator not found in database: ${operator.name}`);
    const plan = await buildOperatorPlan(operator, operatorId, stationMnoNames);
    plans.push(plan);
    logOperatorPlan(plan);
  }

  if (!options.apply) return;

  for (const plan of plans) {
    await applyOperatorPlan(plan);
  }

  logger.log("Applied mno_name sync.");
}

try {
  await main();
} finally {
  await dbClient.end({ timeout: 5 });
}
