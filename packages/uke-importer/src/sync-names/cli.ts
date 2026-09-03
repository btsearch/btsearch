import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { PERMIT_FILE_OPERATOR_MAP } from "../config.js";
import type { CliOptions, FileSpec, OperatorSpec } from "./types.js";

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
    .sort((left, right) => left.localeCompare(right));
}

function parseFileSpec(rawSpec: string, fallbackOperator: OperatorSpec | null): FileSpec[] {
  const equalsIndex = rawSpec.indexOf("=");
  let operator = fallbackOperator;
  let inputPath = rawSpec;

  if (equalsIndex > 0) {
    const operatorToken = rawSpec.slice(0, equalsIndex);
    const explicitOperator = resolveOperator(operatorToken);
    if (!explicitOperator) throw new Error(`Unknown operator "${operatorToken}" in "${rawSpec}"`);
    operator = explicitOperator;
    inputPath = rawSpec.slice(equalsIndex + 1);
  }

  if (!inputPath) throw new Error(`Missing file path in "${rawSpec}"`);

  return expandInputPath(inputPath).map((filePath) => {
    const inferredOperator = operator ?? inferOperatorFromPath(filePath);
    if (!inferredOperator) throw new Error(`Cannot infer operator for ${filePath}. Use operator=${filePath}`);
    return { filePath, operator: inferredOperator };
  });
}

export function parseCliArgs(args: string[]): CliOptions {
  let apply = false;
  let fallbackOperator: OperatorSpec | null = null;
  const files: FileSpec[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
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
      const operatorToken = args[index + 1];
      if (!operatorToken) throw new Error(`${arg} requires an operator key`);
      fallbackOperator = resolveOperator(operatorToken);
      if (!fallbackOperator) throw new Error(`Unknown operator "${operatorToken}"`);
      index++;
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
