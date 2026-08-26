import { resolve } from "node:path";

import { parseSimpleQualifiedName, qualifiedNameKey } from "./dump.mjs";
import { type ExtractOptions, extractPostgresTables } from "./extract.mjs";

export function usage(): string {
  return `Usage:
  pnpm run sql:extract-tables -- --input <dump.sql> --output <subset.sql> \\
    --schema <schema> --table <table> [--table <table> ...]

Tables can also be schema-qualified, for example --table <schema>.<table>.

Options:
  --extension <name>                 Include a required extension object
  --type <schema.type>               Include a type even if it is not detected
  --preserve-owner                   Keep ALTER ... OWNER TO statements
  --include-external-foreign-keys    Keep FKs to tables outside the selection
  --force                            Replace an existing output file
  --help                             Show this help`;
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);

  return value;
}

export function parseOptions(args: string[]): ExtractOptions | undefined {
  let input: string | undefined;
  let output: string | undefined;
  let defaultSchema: string | undefined;
  let preserveOwner = false;
  let includeExternalForeignKeys = false;
  let force = false;
  const tableValues: string[] = [];
  const typeValues: string[] = [];
  const extensions = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    switch (argument) {
      case "--input":
        input = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--output":
        output = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--schema":
        defaultSchema = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--table":
        tableValues.push(readOptionValue(args, index, argument));
        index += 1;
        break;
      case "--type":
        typeValues.push(readOptionValue(args, index, argument));
        index += 1;
        break;
      case "--extension":
        extensions.add(readOptionValue(args, index, argument));
        index += 1;
        break;
      case "--preserve-owner":
        preserveOwner = true;
        break;
      case "--include-external-foreign-keys":
        includeExternalForeignKeys = true;
        break;
      case "--force":
        force = true;
        break;
      case "--help":
      case "-h":
        return undefined;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (input === undefined) throw new Error("--input is required");
  if (output === undefined) throw new Error("--output is required");
  if (tableValues.length === 0) throw new Error("At least one --table is required");

  return {
    input: resolve(input),
    output: resolve(output),
    tables: tableValues.map((value) => parseSimpleQualifiedName(value, defaultSchema)),
    extensions,
    explicitTypes: new Set(typeValues.map((value) => qualifiedNameKey(parseSimpleQualifiedName(value)))),
    preserveOwner,
    includeExternalForeignKeys,
    force,
  };
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseOptions(args);
    if (options === undefined) {
      console.log(usage());
      return;
    }

    await extractPostgresTables(options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}
