import {
  brands,
  licensees,
  microwaveLinks,
  officialDatasets,
  officialImportRuns,
  officialRemapRuns,
  officialSources,
  operators,
} from "@openbts/drizzle";
import type { Licensee, LicenseeListQuery, LicenseeUpdate } from "@openbts/shared/contract";
import { and, eq, exists, inArray, isNotNull, isNull, notExists } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { createKeyset } from "../../lib/keyset.js";
import type { DbTx } from "../../types/global.js";
import type { AuditRecorder } from "../audit/index.js";
import { enqueueRun } from "./import/runs.js";
import { LIVE_RUN_STATES } from "./importRuns.js";
import { type OfficialVisibility, officialSourceIsPublic } from "./visibility.js";

const licenseeSelectSchema = createSelectSchema(licensees);

type LicenseeRow = z.infer<typeof licenseeSelectSchema>;

const SORT = "name";
const SORT_COLUMNS = { name: { column: licensees.name, kind: "text" } } as const;

function toLicensee(row: LicenseeRow, sourceKey: string): Licensee {
  return { id: row.id, sourceKey, name: row.name, legalName: row.full_name, operatorId: row.operatorId, brandId: row.brandId };
}

export async function fetchLicensees(ids: readonly number[]): Promise<Licensee[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select({ licensee: licensees, sourceKey: officialSources.key })
    .from(licensees)
    .innerJoin(officialSources, eq(officialSources.id, licensees.sourceId))
    .where(inArray(licensees.id, [...ids]));
  return rows.map((row) => toLicensee(row.licensee, row.sourceKey));
}

export async function fetchLicensee(id: number): Promise<Licensee | null> {
  const [licensee] = await fetchLicensees([id]);
  return licensee ?? null;
}

export async function fetchLicenseePage(
  query: LicenseeListQuery,
  visibility: OfficialVisibility,
): Promise<{ data: Licensee[]; nextCursor: string | null }> {
  const { ids, sourceKeys, hasOperator, hasMicrowaveLinks, limit, cursor } = query;
  const keyset = createKeyset(SORT, licensees.id, SORT_COLUMNS, cursor);
  const heldLinks = db.select({ id: microwaveLinks.id }).from(microwaveLinks).where(eq(microwaveLinks.operator_id, licensees.id));
  const rows = await db
    .select({ licensee: licensees, sourceKey: officialSources.key, key: keyset.key })
    .from(licensees)
    .innerJoin(officialSources, eq(officialSources.id, licensees.sourceId))
    .where(
      and(
        officialSourceIsPublic(licensees.sourceId, visibility),
        ids ? inArray(licensees.id, ids) : undefined,
        sourceKeys ? inArray(officialSources.key, sourceKeys) : undefined,
        hasOperator === true ? isNotNull(licensees.operatorId) : undefined,
        hasOperator === false ? isNull(licensees.operatorId) : undefined,
        hasMicrowaveLinks === true ? exists(heldLinks) : undefined,
        hasMicrowaveLinks === false ? notExists(heldLinks) : undefined,
        keyset.after,
      ),
    )
    .orderBy(...keyset.orderBy)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    data: page.map((row) => toLicensee(row.licensee, row.sourceKey)),
    nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.licensee.id, key: last.key }) : null,
  };
}

async function assertOperatorExists(tx: DbTx, operatorId: number): Promise<void> {
  const [operator] = await tx.select({ id: operators.id }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) throw new ErrorResponse("BAD_REQUEST", { message: "Operator not found" });
}

async function assertBrandExists(tx: DbTx, brandId: number): Promise<void> {
  const [brand] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new ErrorResponse("BAD_REQUEST", { message: "Brand not found" });
}

async function saveLicensee(
  tx: DbTx,
  audit: AuditRecorder,
  licensee: LicenseeRow,
  change: Partial<Pick<LicenseeRow, "operatorId" | "brandId">>,
): Promise<void> {
  const [saved] = await tx.update(licensees).set(change).where(eq(licensees.id, licensee.id)).returning();
  if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

  await audit.log({ entity: "licensees", op: "update", recordId: licensee.id, old: licensee, new: saved });
}

async function mapToOperator(
  tx: DbTx,
  audit: AuditRecorder,
  licensee: LicenseeRow,
  operatorId: number,
  requestedById: string | null,
): Promise<string | null> {
  await saveLicensee(tx, audit, licensee, { operatorId, brandId: null });
  const sitesDatasets = await tx
    .select({ id: officialDatasets.id })
    .from(officialDatasets)
    .where(and(eq(officialDatasets.sourceId, licensee.sourceId), eq(officialDatasets.layer, "sites"), eq(officialDatasets.isEnabled, true)));
  if (sitesDatasets.length === 0) return null;

  return enqueueRun(tx, {
    sourceId: licensee.sourceId,
    kind: "replay",
    trigger: "manual",
    isDryRun: false,
    datasetIds: sitesDatasets.map((dataset) => dataset.id),
    requestedById,
    approvals: [],
  });
}

async function queueRemap(
  tx: DbTx,
  licensee: LicenseeRow,
  toOperatorId: number | null,
  isDryRun: boolean,
  requestedById: string | null,
): Promise<string> {
  const [liveRemap] = await tx
    .select({ runId: officialRemapRuns.runId })
    .from(officialRemapRuns)
    .innerJoin(officialImportRuns, eq(officialImportRuns.id, officialRemapRuns.runId))
    .where(and(eq(officialRemapRuns.licenseeId, licensee.id), inArray(officialImportRuns.state, LIVE_RUN_STATES)))
    .limit(1);
  if (liveRemap) throw new ErrorResponse("CONFLICT", { message: "This licensee already has a remap run that is queued or running" });

  return enqueueRun(tx, {
    sourceId: licensee.sourceId,
    kind: "remap",
    trigger: "manual",
    isDryRun,
    datasetIds: [],
    requestedById,
    approvals: [],
    remap: { licenseeId: licensee.id, fromOperatorId: licensee.operatorId, toOperatorId },
  });
}

export async function changeLicensee(
  tx: DbTx,
  audit: AuditRecorder,
  id: number,
  change: LicenseeUpdate,
  requestedById: string | null,
): Promise<string | null> {
  const [licensee] = await tx.select().from(licensees).where(eq(licensees.id, id)).for("no key update").limit(1);
  if (!licensee) throw new ErrorResponse("NOT_FOUND");

  const { operatorId, brandId } = change;
  const hasOperator = licensee.operatorId !== null;
  const namesOperator = operatorId !== undefined && operatorId !== null;
  const namesBrand = brandId !== undefined && brandId !== null;
  if (hasOperator && namesBrand) throw new ErrorResponse("CONFLICT", { message: "A licensee with an operator has no brand of its own" });
  if (namesOperator && operatorId !== licensee.operatorId) await assertOperatorExists(tx, operatorId);
  if (namesBrand && brandId !== licensee.brandId) await assertBrandExists(tx, brandId);

  if (hasOperator) {
    if (operatorId === undefined || operatorId === licensee.operatorId) return null;
    return queueRemap(tx, licensee, operatorId, change.isDryRun ?? true, requestedById);
  }
  if (namesOperator) return mapToOperator(tx, audit, licensee, operatorId, requestedById);
  if (brandId !== undefined && brandId !== licensee.brandId) await saveLicensee(tx, audit, licensee, { brandId });
  return null;
}
