/* eslint-disable no-await-in-loop -- the dump is streamed in source order */

import { createReadStream } from "node:fs";
import { access, mkdir, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { orderTablesByDependencies } from "./dependency-order.mjs";
import {
  type BufferedBlock,
  type DumpObjectHeader,
  type QualifiedName,
  displayQualifiedName,
  findIdentitySequences,
  findOwningTable,
  findReferencedTables,
  parseObjectHeader,
  qualifiedNameKey,
  sqlMentionsQualifiedName,
} from "./dump.mjs";
import { type OutputSink, appendFileToOutput, createOutputSink, destroyOutputSink, writeBlock, writeLine } from "./output.mjs";

export type ExtractOptions = {
  input: string;
  output: string;
  tables: QualifiedName[];
  extensions: Set<string>;
  explicitTypes: Set<string>;
  preserveOwner: boolean;
  includeExternalForeignKeys: boolean;
  force: boolean;
};

type CurrentBlock =
  | {
      kind: "buffer";
      block: BufferedBlock;
    }
  | {
      kind: "table-data";
      header: DumpObjectHeader;
      include: boolean;
      inCopyPayload: boolean;
      rows: number;
      spool?: OutputSink;
    };

type PendingBlock = {
  block: BufferedBlock;
  condition: "always" | "type" | "sequence";
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;

    throw error;
  }
}

function normalizeComparablePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

async function pathsReferToSameFile(input: string, output: string, outputExists: boolean): Promise<boolean> {
  const canonicalInput = await realpath(input);
  const canonicalOutput = outputExists ? await realpath(output) : resolve(await realpath(dirname(output)), basename(output));

  return normalizeComparablePath(canonicalInput) === normalizeComparablePath(canonicalOutput);
}

export async function extractPostgresTables(options: ExtractOptions): Promise<void> {
  const outputExists = await pathExists(options.output);
  if (!options.force && outputExists) throw new Error(`Output already exists: ${options.output}. Use --force to replace it.`);

  await mkdir(dirname(options.output), { recursive: true });

  if (await pathsReferToSameFile(options.input, options.output, outputExists)) throw new Error("Input and output paths must be different");

  const temporaryOutput = `${options.output}.tmp-${process.pid}-${Date.now()}`;
  const spoolDirectory = `${temporaryOutput}.data`;
  const output = createOutputSink(temporaryOutput);

  const targetKeys = new Set(options.tables.map(qualifiedNameKey));
  const targetNames = new Map<string, QualifiedName>(options.tables.map((table) => [qualifiedNameKey(table), table]));
  const targetSchemas = new Set(options.tables.map((table) => table.schema));
  const foundTables = new Set<string>();
  const foundTableData = new Set<string>();
  const sequenceKeys = new Set<string>();
  const includedTypeKeys = new Set(options.explicitTypes);
  const preamble: string[] = [];
  const pendingBlocks: PendingBlock[] = [];
  const deferredPostDataBlocks: BufferedBlock[] = [];
  const dependencies = new Map<string, Set<string>>();
  const dataSpoolPaths = new Map<string, string[]>();
  const dataTableSourceOrder: string[] = [];
  const activeSpoolSinks = new Set<OutputSink>();
  const skippedExternalForeignKeys: string[] = [];
  const rowCounts = new Map<string, number>();
  const strippedOwnerStatements = { count: 0 };
  let nextSpoolIndex = 0;
  let currentBlock: CurrentBlock | undefined;
  let sawObjectHeader = false;
  let outputStarted = false;
  let selectedTableSql = "";

  function resolveReferencedTypes(): void {
    let changed = true;

    while (changed) {
      changed = false;
      const includedTypeSql = pendingBlocks
        .filter((pending) => pending.condition === "type" && includedTypeKeys.has(qualifiedNameKey(pending.block.header)))
        .map((pending) => pending.block.lines.join("\n"));
      const corpus = [selectedTableSql, ...includedTypeSql].join("\n");

      for (const pending of pendingBlocks) {
        if (pending.condition !== "type") continue;

        const typeKey = qualifiedNameKey(pending.block.header);
        if (includedTypeKeys.has(typeKey)) continue;
        if (!sqlMentionsQualifiedName(corpus, pending.block.header)) continue;

        includedTypeKeys.add(typeKey);
        changed = true;
      }
    }
  }

  async function flushPendingBlocks(): Promise<void> {
    if (outputStarted) return;

    resolveReferencedTypes();

    for (const line of preamble) {
      if (line.startsWith("\\restrict ") || line.startsWith("\\unrestrict ")) continue;

      await writeLine(output, line);
    }

    for (const pending of pendingBlocks) {
      if (pending.condition === "type" && !includedTypeKeys.has(qualifiedNameKey(pending.block.header))) continue;
      if (pending.condition === "sequence" && !sequenceKeys.has(qualifiedNameKey(pending.block.header))) continue;

      await writeBlock(output, pending.block, options.preserveOwner, strippedOwnerStatements);
    }

    outputStarted = true;
  }

  function processBufferedBlock(block: BufferedBlock): void {
    const { header } = block;
    const sql = block.lines.join("\n");
    const headerKey = qualifiedNameKey(header);
    const owner = findOwningTable(sql);
    const ownerKey = owner === undefined ? undefined : qualifiedNameKey(owner);
    const ownerIsTarget = ownerKey !== undefined && targetKeys.has(ownerKey);
    let condition: PendingBlock["condition"] | undefined;

    if (header.type === "SCHEMA" && targetSchemas.has(header.name)) condition = "always";
    else if (header.type === "EXTENSION" && options.extensions.has(header.name)) condition = "always";
    else if (header.type === "COMMENT" && [...options.extensions].some((extension) => sql.includes(`COMMENT ON EXTENSION ${extension}`)))
      condition = "always";
    else if (header.type === "TYPE" || header.type === "DOMAIN") condition = "type";
    else if (header.type === "TABLE" && targetKeys.has(headerKey)) {
      condition = "always";
      foundTables.add(headerKey);
      selectedTableSql += `${sql}\n`;
      for (const sequence of findIdentitySequences(sql)) sequenceKeys.add(qualifiedNameKey(sequence));
    } else if (header.type.includes("SEQUENCE")) {
      if (ownerIsTarget) {
        sequenceKeys.add(headerKey);
        for (const sequence of findIdentitySequences(sql)) sequenceKeys.add(qualifiedNameKey(sequence));
        condition = "always";
      } else if (sequenceKeys.has(headerKey)) condition = "always";
      else condition = "sequence";
    } else if (header.type === "FK CONSTRAINT" && ownerKey !== undefined && ownerIsTarget) {
      const references = findReferencedTables(sql);
      const internalReferences = references.filter((reference) => targetKeys.has(qualifiedNameKey(reference)));
      const externalReferences = references.filter((reference) => !targetKeys.has(qualifiedNameKey(reference)));

      if (internalReferences.length > 0) {
        const tableDependencies = dependencies.get(ownerKey) ?? new Set<string>();
        for (const reference of internalReferences) tableDependencies.add(qualifiedNameKey(reference));
        dependencies.set(ownerKey, tableDependencies);
      }

      if (externalReferences.length > 0 && !options.includeExternalForeignKeys) skippedExternalForeignKeys.push(header.name);
      else condition = "always";
    } else if (ownerIsTarget) condition = "always";

    if (condition === undefined) return;

    const pending = { block, condition };
    if (!outputStarted) {
      pendingBlocks.push(pending);
      return;
    }

    if (condition === "type" && !includedTypeKeys.has(headerKey)) return;
    if (condition === "sequence" && !sequenceKeys.has(headerKey)) return;

    deferredPostDataBlocks.push(block);
  }

  async function finishCurrentBlock(): Promise<void> {
    if (currentBlock === undefined) return;

    if (currentBlock.kind === "buffer") processBufferedBlock(currentBlock.block);
    else if (currentBlock.include) {
      if (currentBlock.spool === undefined) throw new Error(`Missing data spool for ${displayQualifiedName(currentBlock.header)}`);

      currentBlock.spool.stream.end();
      await currentBlock.spool.completion;
      activeSpoolSinks.delete(currentBlock.spool);

      const key = qualifiedNameKey(currentBlock.header);
      foundTableData.add(key);
      rowCounts.set(key, (rowCounts.get(key) ?? 0) + currentBlock.rows);
    }

    currentBlock = undefined;
  }

  async function startBlock(header: DumpObjectHeader, headerLine: string): Promise<void> {
    const includeTableData = header.type === "TABLE DATA" && targetKeys.has(qualifiedNameKey(header));

    if (header.type !== "TABLE DATA") {
      currentBlock = {
        kind: "buffer",
        block: { header, lines: [headerLine] },
      };
      return;
    }

    if (!includeTableData) {
      currentBlock = {
        kind: "table-data",
        header,
        include: false,
        inCopyPayload: false,
        rows: 0,
      };
      return;
    }

    await flushPendingBlocks();
    const tableKey = qualifiedNameKey(header);
    const spoolPath = join(spoolDirectory, `${nextSpoolIndex}.sql`);
    nextSpoolIndex += 1;
    const spool = createOutputSink(spoolPath);
    activeSpoolSinks.add(spool);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      spool.stream.once("open", resolveOpen);
      spool.stream.once("error", rejectOpen);
    });

    const tableSpoolPaths = dataSpoolPaths.get(tableKey);
    if (tableSpoolPaths === undefined) {
      dataSpoolPaths.set(tableKey, [spoolPath]);
      dataTableSourceOrder.push(tableKey);
    } else tableSpoolPaths.push(spoolPath);

    currentBlock = {
      kind: "table-data",
      header,
      include: true,
      inCopyPayload: false,
      rows: 0,
      spool,
    };

    await writeLine(spool, "--");
    await writeLine(spool, headerLine);
  }

  try {
    await new Promise<void>((resolveOpen, rejectOpen) => {
      output.stream.once("open", resolveOpen);
      output.stream.once("error", rejectOpen);
    });
    await mkdir(spoolDirectory);

    const input = createReadStream(options.input, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

    for await (const line of lines) {
      if (currentBlock?.kind === "table-data" && currentBlock.inCopyPayload) {
        if (currentBlock.include) {
          if (currentBlock.spool === undefined) throw new Error(`Missing data spool for ${displayQualifiedName(currentBlock.header)}`);
          await writeLine(currentBlock.spool, line);
        }

        if (line === "\\.") currentBlock.inCopyPayload = false;
        else currentBlock.rows += 1;

        continue;
      }

      const header = parseObjectHeader(line);
      if (header !== undefined) {
        sawObjectHeader = true;
        await finishCurrentBlock();
        await startBlock(header, line);
        continue;
      }

      if (!sawObjectHeader) {
        preamble.push(line);
        continue;
      }

      if (currentBlock?.kind === "buffer") {
        currentBlock.block.lines.push(line);
        continue;
      }

      if (currentBlock?.kind === "table-data") {
        if (currentBlock.include) {
          if (currentBlock.spool === undefined) throw new Error(`Missing data spool for ${displayQualifiedName(currentBlock.header)}`);
          await writeLine(currentBlock.spool, line);
        }
        if (/^COPY\s+.+\s+FROM stdin;$/.test(line)) currentBlock.inCopyPayload = true;
      }
    }

    if (currentBlock?.kind === "table-data" && currentBlock.inCopyPayload)
      throw new Error(`Unexpected end of file inside COPY data for ${displayQualifiedName(currentBlock.header)}`);

    await finishCurrentBlock();
    await flushPendingBlocks();

    const missingTables = options.tables.filter((table) => !foundTables.has(qualifiedNameKey(table)));
    if (missingTables.length > 0) throw new Error(`Table definitions not found: ${missingTables.map(displayQualifiedName).join(", ")}`);

    const remainingTableKeys = [...targetKeys].filter((tableKey) => !dataTableSourceOrder.includes(tableKey));
    const dependencyOrder = orderTablesByDependencies([...dataTableSourceOrder, ...remainingTableKeys], dependencies);

    for (const tableKey of dependencyOrder.tableKeys) {
      for (const spoolPath of dataSpoolPaths.get(tableKey) ?? []) {
        await appendFileToOutput(spoolPath, output);
        await rm(spoolPath, { force: true });
      }
    }

    for (const block of deferredPostDataBlocks) await writeBlock(output, block, options.preserveOwner, strippedOwnerStatements);

    await rm(spoolDirectory, { recursive: true, force: true });

    await writeLine(output, "");
    await writeLine(output, "--");
    await writeLine(output, "-- PostgreSQL table subset dump complete");
    await writeLine(output, "--");
    output.stream.end();
    await output.completion;

    if (options.force && (await pathExists(options.output))) await rm(options.output, { force: true });

    await rename(temporaryOutput, options.output);

    console.log(`Created ${options.output}`);
    for (const table of options.tables) {
      const key = qualifiedNameKey(table);
      const dataStatus = foundTableData.has(key) ? `${rowCounts.get(key) ?? 0} rows` : "no TABLE DATA block";
      console.log(`  ${displayQualifiedName(table)}: ${dataStatus}`);
    }
    if (includedTypeKeys.size > 0) console.log(`Included ${includedTypeKeys.size} referenced/explicit type(s).`);
    if (skippedExternalForeignKeys.length > 0)
      console.log(`Skipped ${skippedExternalForeignKeys.length} external foreign key(s): ${skippedExternalForeignKeys.join(", ")}`);
    if (dependencyOrder.cyclicTableKeys.size > 0) {
      const cyclicTables = [...dependencyOrder.cyclicTableKeys]
        .map((tableKey) => targetNames.get(tableKey))
        .filter((table): table is QualifiedName => table !== undefined)
        .map(displayQualifiedName);
      console.log(`Warning: cyclic table dependencies cannot be made foreign-key safe: ${cyclicTables.join(", ")}`);
    }
    if (strippedOwnerStatements.count > 0)
      console.log(`Stripped ${strippedOwnerStatements.count} OWNER statement(s); use --preserve-owner to keep them.`);
  } catch (error: unknown) {
    for (const spool of activeSpoolSinks) spool.stream.destroy();
    await Promise.all([...activeSpoolSinks].map(destroyOutputSink));
    await destroyOutputSink(output);
    try {
      await rm(spoolDirectory, { recursive: true, force: true });
    } catch (cleanupError: unknown) {
      void cleanupError;
    }
    try {
      await rm(temporaryOutput, { force: true });
    } catch (cleanupError: unknown) {
      void cleanupError;
    }
    throw error;
  }
}
