import { officialRemapRuns, officialSites } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { type LinkGroupKey, type StationGroupKey, correctStationLinks, readOfficialGroupsAfter } from "../../links.js";
import { insertChanges, readChanges } from "../changes.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { AfterStep, AfterStepContext, ChangeInput, ChangeKind, ChangeRow } from "../types.js";

const GROUP_CHANGING_KINDS: readonly ChangeKind[] = ["site_added", "site_moved", "site_remapped", "permit_added", "permit_archived"];

async function readFormerOperatorId(tx: DbTx, runId: string): Promise<number | null> {
  const [remap] = await tx
    .select({ fromOperatorId: officialRemapRuns.fromOperatorId })
    .from(officialRemapRuns)
    .where(eq(officialRemapRuns.runId, runId))
    .limit(1);
  if (!remap) throw new Error(`Import run ${runId} remapped sites without a remap row`);

  return remap.fromOperatorId;
}

async function readAffectedGroups(tx: DbTx, runId: string, changes: readonly ChangeRow[]): Promise<StationGroupKey[]> {
  const sites = await tx
    .select({ id: officialSites.id, operatorId: officialSites.operator_id, siteId: officialSites.station_id })
    .from(officialSites)
    .where(inArray(officialSites.id, unique(changes.map((change) => change.officialSiteId))));
  const remappedSiteIds = new Set(changes.filter((change) => change.kind === "site_remapped").map((change) => change.officialSiteId));
  const remappedSites = sites.filter((site) => remappedSiteIds.has(site.id));
  if (remappedSites.length === 0) return sites;

  const formerOperatorId = await readFormerOperatorId(tx, runId);
  return [...sites, ...remappedSites.map(({ siteId }) => ({ operatorId: formerOperatorId, siteId }))];
}

async function relinkGroups(tx: DbTx, { run }: AfterStepContext, groups: readonly StationGroupKey[]): Promise<void> {
  const { added, removed } = await correctStationLinks(tx, groups, { locksStations: !run.isDryRun });
  await insertChanges(tx, run.id, [
    ...added.map((link): ChangeInput => ({ kind: "station_linked", ...link })),
    ...removed.map((link): ChangeInput => ({ kind: "station_unlinked", ...link })),
  ]);
}

async function relinkGroupsChangedAfter(tx: DbTx, context: AfterStepContext, afterSeq: number | null): Promise<number | null> {
  const { run } = context;
  const changes = await readChanges(tx, run.id, { afterSeq, kinds: GROUP_CHANGING_KINDS, limit: STATEMENT_BATCH_SIZE });
  const lastChange = changes.at(-1);
  if (!lastChange) return null;

  await relinkGroups(tx, context, await readAffectedGroups(tx, run.id, changes));
  await context.saveProgress(tx, lastChange.seq);
  return changes.length < STATEMENT_BATCH_SIZE ? null : lastChange.seq;
}

async function relinkGroupsAfter(tx: DbTx, context: AfterStepContext, last: LinkGroupKey | undefined): Promise<LinkGroupKey | undefined> {
  const groups = await readOfficialGroupsAfter(tx, last);
  await relinkGroups(tx, context, groups);
  return groups.at(-1);
}

async function relinkEveryGroup(context: AfterStepContext): Promise<void> {
  let last: LinkGroupKey | undefined;
  do {
    const after = last;
    // eslint-disable-next-line no-await-in-loop
    last = await context.transaction((tx) => relinkGroupsAfter(tx, context, after));
  } while (last !== undefined);
}

async function perform(context: AfterStepContext): Promise<void> {
  if (context.run.kind === "relink") return relinkEveryGroup(context);

  let lastSeq = context.lastSeq;
  do {
    const afterSeq = lastSeq;
    // eslint-disable-next-line no-await-in-loop
    lastSeq = await context.transaction((tx) => relinkGroupsChangedAfter(tx, context, afterSeq));
  } while (lastSeq !== null);
}

export const links: AfterStep = { name: "links", runsInDryRun: true, perform };
