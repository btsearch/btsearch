import { microwaveLinks, officialSites, stations } from "@openbts/drizzle";
import type { ListItemsInput } from "@openbts/shared/contract";
import { and, inArray } from "drizzle-orm";

import { DetailedErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { type OfficialVisibility, microwaveLinkIsPublic, officialLocationIsPublic } from "../official/visibility.js";
import { stationAreaConditions } from "../stations/read.js";
import type { UserListMembership } from "./visibility.js";

export function applyItemChanges(current: readonly number[], add: readonly number[] = [], remove: readonly number[] = []): number[] {
  return [...new Set(current).difference(new Set(remove)).union(new Set(add))];
}

function notIn(stored: readonly number[], ids: readonly number[] | undefined): number[] | undefined {
  const storedIds = new Set(stored);
  return ids?.filter((id) => !storedIds.has(id));
}

export function itemsNotStored(items: ListItemsInput, stored: UserListMembership): ListItemsInput {
  return {
    stationIds: notIn(stored.internal, items.stationIds),
    officialSiteIds: notIn(stored.official, items.officialSiteIds),
    microwaveLinkIds: notIn(stored.microwaveLinks, items.microwaveLinkIds),
  };
}

function missingIds(wanted: readonly number[] | undefined, found: readonly { id: number }[]): number[] {
  const existing = new Set(found.map((row) => row.id));
  return [...new Set(wanted).difference(existing)];
}

export async function assertItemsExist(tx: DbTx, items: ListItemsInput, visibility: OfficialVisibility): Promise<void> {
  const { stationIds, officialSiteIds, microwaveLinkIds } = items;

  const [stationRows, officialSiteRows, microwaveLinkRows] = await Promise.all([
    stationIds?.length
      ? tx
          .select({ id: stations.id })
          .from(stations)
          .where(and(inArray(stations.id, stationIds), ...stationAreaConditions({}, visibility.hiddenCountryCodes)))
      : [],
    officialSiteIds?.length
      ? tx
          .select({ id: officialSites.id })
          .from(officialSites)
          .where(and(inArray(officialSites.id, officialSiteIds), officialLocationIsPublic(officialSites.location_id, visibility)))
      : [],
    microwaveLinkIds?.length
      ? tx
          .select({ id: microwaveLinks.id })
          .from(microwaveLinks)
          .where(and(inArray(microwaveLinks.id, microwaveLinkIds), microwaveLinkIsPublic(microwaveLinks.dataset_id, visibility)))
      : [],
  ]);

  const details = [
    { field: "stationIds", ids: missingIds(stationIds, stationRows) },
    { field: "officialSiteIds", ids: missingIds(officialSiteIds, officialSiteRows) },
    { field: "microwaveLinkIds", ids: missingIds(microwaveLinkIds, microwaveLinkRows) },
  ].filter((entry) => entry.ids.length > 0);
  if (details.length > 0) throw new DetailedErrorResponse("BAD_REQUEST", details, { message: "Some of the items do not exist" });
}
