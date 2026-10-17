import { officialImportChanges } from "@openbts/drizzle";
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";

import { chunks } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { STATEMENT_BATCH_SIZE } from "./config.js";
import type { ChangeInput, ChangeKind, ChangeRow } from "./types.js";

export type ChangeCount = Pick<ChangeRow, "datasetId" | "slice" | "kind"> & { count: number };

const CHANGES_PER_READ = 5_000;

export async function insertChanges(tx: DbTx, runId: string, changes: readonly ChangeInput[]): Promise<void> {
  for (const group of chunks(changes, STATEMENT_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await tx.insert(officialImportChanges).values(group.map((change) => ({ runId, ...change })));
  }
}

export async function readChanges(
  tx: Pick<DbTx, "select">,
  runId: string,
  page: { afterSeq: number | null; kinds: readonly ChangeKind[]; limit: number },
): Promise<ChangeRow[]> {
  return tx
    .select()
    .from(officialImportChanges)
    .where(
      and(
        eq(officialImportChanges.runId, runId),
        inArray(officialImportChanges.kind, [...page.kinds]),
        page.afterSeq === null ? undefined : gt(officialImportChanges.seq, page.afterSeq),
      ),
    )
    .orderBy(asc(officialImportChanges.seq))
    .limit(page.limit);
}

export async function readEveryChange(tx: Pick<DbTx, "select">, runId: string, kinds: readonly ChangeKind[]): Promise<ChangeRow[]> {
  const changes: ChangeRow[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await readChanges(tx, runId, { afterSeq: changes.at(-1)?.seq ?? null, kinds, limit: CHANGES_PER_READ });
    for (const change of page) changes.push(change);
    if (page.length < CHANGES_PER_READ) return changes;
  }
}

export async function countChanges(tx: Pick<DbTx, "select">, runId: string): Promise<ChangeCount[]> {
  return tx
    .select({
      datasetId: officialImportChanges.datasetId,
      slice: officialImportChanges.slice,
      kind: officialImportChanges.kind,
      count: count(),
    })
    .from(officialImportChanges)
    .where(eq(officialImportChanges.runId, runId))
    .groupBy(officialImportChanges.datasetId, officialImportChanges.slice, officialImportChanges.kind);
}
