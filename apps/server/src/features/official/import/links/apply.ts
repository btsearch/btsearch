/* eslint-disable no-await-in-loop */
import type { MicrowaveLinkRecord, MicrowaveLinksDataset, ReadContext } from "@openbts/country-packs/sources";
import { microwaveLinks } from "@openbts/drizzle";
import { and, eq, getTableColumns, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { chunks, unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { DECISION_NUMBER_MAX_LENGTH, LINK_INSERT_BATCH_SIZE, STATEMENT_BATCH_SIZE } from "../config.js";
import { type ResolvedLicensee, resolveLicensees } from "../licensees.js";
import { type SkipCounts, countSkip } from "../skips.js";
import type { ChangeInput, ReleaseInput, SliceCount } from "../types.js";
import { type LinkChange, decideLinks } from "./decide.js";
import { resolveEquipment } from "./equipment.js";
import { type LinkValues, toLinkValues } from "./values.js";

const linkColumns = getTableColumns(microwaveLinks);

type PublishedLinks = { slice: string; records: MicrowaveLinkRecord[] };
type StagedLinks = PublishedLinks & { licensees: Map<string, ResolvedLicensee>; counts: SliceCount[] };

async function readRecords(
  input: ReleaseInput,
  definition: MicrowaveLinksDataset,
  context: ReadContext,
  slice: string,
  skips: SkipCounts,
): Promise<MicrowaveLinkRecord[]> {
  const records: MicrowaveLinkRecord[] = [];
  for await (const record of definition.parse(context, input.release, input.files)) {
    if (record.slice !== slice) {
      throw new Error(`The reader of ${input.dataset.key} gave a record of the slice "${record.slice}", which its release does not cover`);
    }

    if (Array.from(record.permitNumber).length > DECISION_NUMBER_MAX_LENGTH) countSkip(skips, slice, "decision_number_too_long");
    else records.push(record);
  }

  return records;
}

export async function countLiveLinks(tx: DbTx, datasetId: number): Promise<number> {
  return tx.$count(microwaveLinks, eq(microwaveLinks.dataset_id, datasetId));
}

export async function hasEveryTechnicalColumn(tx: Pick<DbTx, "select">, datasetId: number): Promise<boolean> {
  const [outdated] = await tx
    .select({ id: microwaveLinks.id })
    .from(microwaveLinks)
    .where(
      and(eq(microwaveLinks.dataset_id, datasetId), or(isNull(microwaveLinks.specs_date), lt(microwaveLinks.specs_date, microwaveLinks.updatedAt))),
    )
    .limit(1);
  return outdated === undefined;
}

export async function readPublishedLinks(
  input: ReleaseInput,
  definition: MicrowaveLinksDataset,
  context: ReadContext,
  skips: SkipCounts,
): Promise<PublishedLinks> {
  const [slice, ...otherSlices] = input.release.coveredSlices;
  if (slice === undefined || otherSlices.length > 0) throw new Error(`A release of ${input.dataset.key} covers the whole dataset as one slice`);

  return { slice, records: await readRecords(input, definition, context, slice, skips) };
}

export async function stageLinks(tx: DbTx, input: ReleaseInput, { slice, records }: PublishedLinks): Promise<StagedLinks> {
  const { dataset, scope } = input;
  const publishedNames = unique(records.map((record) => record.licensee));
  const licensees = await resolveLicensees(tx, scope.run.sourceId, scope.source, publishedNames, { addsUnmapped: true });
  const liveCount = await countLiveLinks(tx, dataset.id);

  return { slice, records, licensees, counts: [{ slice, stagedCount: records.length, liveCount }] };
}

async function insertLinks(tx: DbTx, datasetId: number, inserts: readonly LinkValues[], fileDate: Date): Promise<number[]> {
  const addedIds: number[] = [];
  for (const group of chunks(inserts, LINK_INSERT_BATCH_SIZE)) {
    const added = await tx
      .insert(microwaveLinks)
      .values(group.map((values) => ({ ...values, dataset_id: datasetId, createdAt: fileDate, updatedAt: fileDate })))
      .returning({ id: microwaveLinks.id });
    addedIds.push(...added.map((link) => link.id));
  }

  return addedIds;
}

function columnRowOf(id: number, values: LinkValues): Record<string, unknown> {
  return { id, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [linkColumns[key as keyof LinkValues].name, value])) };
}

async function updateLinksWithSameColumns(tx: DbTx, changes: readonly LinkChange[], fileDate: Date): Promise<void> {
  const columns = Object.keys(changes[0]?.values ?? {}).map((key) => linkColumns[key as keyof LinkValues]);
  const assignments = sql.join(
    columns.map((column) => sql`${sql.identifier(column.name)} = changed.${sql.identifier(column.name)}`),
    sql`, `,
  );
  const definitions = sql.join(
    columns.map((column) => sql`${sql.identifier(column.name)} ${sql.raw(column.getSQLType())}`),
    sql`, `,
  );
  for (const group of chunks(changes, STATEMENT_BATCH_SIZE)) {
    const rows = group.map(({ id, values }) => columnRowOf(id, values));
    await tx.execute(sql`
      UPDATE ${microwaveLinks} AS link
      SET ${assignments}, "updatedAt" = ${fileDate.toISOString()}::timestamp with time zone
      FROM jsonb_to_recordset(${sql.param(rows)}::jsonb) AS changed (id integer, ${definitions})
      WHERE link.id = changed.id
    `);
  }
}

async function updateLinks(tx: DbTx, changes: readonly LinkChange[], fileDate: Date): Promise<void> {
  const byColumns = Map.groupBy(changes, ({ values }) => Object.keys(values).join());
  for (const group of byColumns.values()) await updateLinksWithSameColumns(tx, group, fileDate);
}

async function deleteLinks(tx: DbTx, ids: readonly number[]): Promise<void> {
  for (const group of chunks(ids, STATEMENT_BATCH_SIZE)) await tx.delete(microwaveLinks).where(inArray(microwaveLinks.id, group));
}

export async function applyLinks(tx: DbTx, input: ReleaseInput, staged: StagedLinks, skips: SkipCounts): Promise<ChangeInput[]> {
  const { dataset, fileDate } = input;
  const { slice, records, licensees } = staged;
  const datasetId = dataset.id;
  const equipment = await resolveEquipment(tx, records);
  const published = records.map((record) => {
    const licenseeId = record.licensee === null ? null : (licensees.get(record.licensee)?.licenseeId ?? null);
    return toLinkValues(record, licenseeId, equipment);
  });
  const stored = await tx.select().from(microwaveLinks).where(eq(microwaveLinks.dataset_id, datasetId));
  const decision = decideLinks(stored, published);
  countSkip(skips, slice, "duplicate_link", decision.duplicateRecords);

  const addedIds = await insertLinks(tx, datasetId, decision.inserts, fileDate);
  await updateLinks(tx, [...decision.updates, ...decision.renewals], fileDate);
  await deleteLinks(tx, decision.archivedIds);
  if (records.every((record) => record.publishesEveryTechnicalColumn)) {
    await tx.update(microwaveLinks).set({ specs_date: fileDate }).where(eq(microwaveLinks.dataset_id, datasetId));
  }

  return [
    ...addedIds.map((microwaveLinkId): ChangeInput => ({ kind: "microwave_link_added", datasetId, slice, microwaveLinkId })),
    ...decision.renewals.map(({ id }): ChangeInput => ({ kind: "microwave_link_renewed", datasetId, slice, microwaveLinkId: id })),
    ...decision.archivedIds.map((microwaveLinkId): ChangeInput => ({ kind: "microwave_link_archived", datasetId, slice, microwaveLinkId })),
  ];
}
