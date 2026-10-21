/* eslint-disable no-await-in-loop */
import { licensees, officialPermitListings, officialPermits, officialRemapRuns, officialSites } from "@openbts/drizzle";
import { type SQLWrapper, and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { chunks, unique } from "../../../../lib/collections.js";
import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { RemapRun } from "../types.js";
import type { RemapInput, RemapListing, RemapPermit, RemapSite } from "./plan.js";

function sitesListedUnder(tx: DbTx, licenseeId: number): SQLWrapper {
  return tx
    .select({ officialSiteId: officialPermits.official_site_id })
    .from(officialPermits)
    .innerJoin(officialPermitListings, eq(officialPermitListings.permitId, officialPermits.id))
    .where(eq(officialPermitListings.licenseeId, licenseeId));
}

export async function readRemapRun(tx: DbTx, runId: string): Promise<RemapRun> {
  const [remap] = await tx
    .select({
      licenseeId: officialRemapRuns.licenseeId,
      fromOperatorId: officialRemapRuns.fromOperatorId,
      toOperatorId: officialRemapRuns.toOperatorId,
    })
    .from(officialRemapRuns)
    .where(eq(officialRemapRuns.runId, runId))
    .limit(1);
  if (!remap) throw new Error(`Remap run ${runId} does not say which licensee it remaps`);

  return remap;
}

export async function lockLicensee(tx: DbTx, licenseeId: number): Promise<{ sourceId: number; operatorId: number | null }> {
  const [licensee] = await tx
    .select({ sourceId: licensees.sourceId, operatorId: licensees.operatorId })
    .from(licensees)
    .where(eq(licensees.id, licenseeId))
    .for("update")
    .limit(1);
  if (!licensee) throw new Error(`Licensee ${licenseeId} does not exist`);

  return licensee;
}

async function readSitesListedUnder(tx: DbTx, sourceId: number, licenseeId: number): Promise<RemapSite[]> {
  return tx
    .select({
      id: officialSites.id,
      siteCode: officialSites.station_id,
      sourceRef: officialSites.source_ref,
      operatorId: officialSites.operator_id,
    })
    .from(officialSites)
    .where(and(eq(officialSites.source_id, sourceId), inArray(officialSites.id, sitesListedUnder(tx, licenseeId))))
    .orderBy(officialSites.id);
}

async function readTargets(tx: DbTx, sourceId: number, licenseeId: number, toOperatorId: number): Promise<RemapSite[]> {
  const target = alias(officialSites, "target");
  return tx
    .selectDistinct({ id: target.id, siteCode: target.station_id, sourceRef: target.source_ref, operatorId: target.operator_id })
    .from(target)
    .innerJoin(officialSites, eq(officialSites.station_id, target.station_id))
    .where(
      and(
        eq(target.source_id, sourceId),
        eq(target.operator_id, toOperatorId),
        isNull(target.source_ref),
        eq(officialSites.source_id, sourceId),
        ne(officialSites.operator_id, toOperatorId),
        inArray(officialSites.id, sitesListedUnder(tx, licenseeId)),
      ),
    )
    .orderBy(target.id);
}

async function readPermits(tx: DbTx, siteIds: readonly number[]): Promise<RemapPermit[]> {
  const permits: RemapPermit[] = [];
  for (const group of chunks(siteIds, STATEMENT_BATCH_SIZE)) {
    permits.push(
      ...(await tx
        .select({
          id: officialPermits.id,
          officialSiteId: officialPermits.official_site_id,
          valuesKey: sql<string>`jsonb_build_array(
            ${officialPermits.rat}, ${officialPermits.label_mhz}, ${officialPermits.label_variant},
            ${officialPermits.decision_number}, ${officialPermits.decision_type}, ${officialPermits.expiry_date}
          )::text`,
        })
        .from(officialPermits)
        .where(sql`${officialPermits.official_site_id} IN ${idsIn(group)}`)
        .orderBy(officialPermits.id)),
    );
  }

  return permits;
}

async function readListings(tx: DbTx, siteIds: readonly number[]): Promise<RemapListing[]> {
  const listings: RemapListing[] = [];
  for (const group of chunks(siteIds, STATEMENT_BATCH_SIZE)) {
    listings.push(
      ...(await tx
        .select({
          permitId: officialPermitListings.permitId,
          datasetId: officialPermitListings.datasetId,
          licenseeId: officialPermitListings.licenseeId,
        })
        .from(officialPermitListings)
        .innerJoin(officialPermits, eq(officialPermits.id, officialPermitListings.permitId))
        .where(sql`${officialPermits.official_site_id} IN ${idsIn(group)}`)
        .orderBy(officialPermitListings.permitId, officialPermitListings.datasetId)),
    );
  }

  return listings;
}

export async function readRemapInput(tx: DbTx, sourceId: number, { licenseeId, toOperatorId }: RemapRun): Promise<RemapInput> {
  const sites = await readSitesListedUnder(tx, sourceId, licenseeId);
  const targets = toOperatorId === null ? [] : await readTargets(tx, sourceId, licenseeId, toOperatorId);
  const listedSiteIds = sites.map((site) => site.id);
  const sourceLicensees = await tx
    .select({ id: licensees.id, operatorId: licensees.operatorId })
    .from(licensees)
    .where(eq(licensees.sourceId, sourceId));

  return {
    licenseeId,
    toOperatorId,
    operatorByLicensee: new Map(sourceLicensees.map((licensee) => [licensee.id, licensee.operatorId])),
    sites,
    targets,
    permits: await readPermits(tx, unique([...listedSiteIds, ...targets.map((target) => target.id)])),
    listings: await readListings(tx, listedSiteIds),
  };
}
