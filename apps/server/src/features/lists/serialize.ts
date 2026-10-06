import { stations, ukeStations, users } from "@openbts/drizzle";
import type { List, ListInclude, ListOperatorCount, UserRef } from "@openbts/shared/contract";
import { and, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { stationAreaConditions } from "../stations/read.js";
import { toUserRef } from "../users/userRef.js";
import { type UserListMembership, type UserListRow, getUserListMembership } from "./visibility.js";

type OperatorById = ReadonlyMap<number, number | null>;

export function toList(row: UserListRow, viewerId: string | null): List {
  const membership = getUserListMembership(row);
  const isOwner = row.created_by === viewerId;

  return {
    id: row.uuid,
    name: row.name,
    description: row.description,
    isPublic: row.is_public === true,
    isOwner,
    notificationsEnabled: isOwner ? row.notificationsEnabled : null,
    itemCounts: { stations: membership.internal.length, officialSites: membership.uke.length, microwaveLinks: membership.radiolines.length },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwners(rows: UserListRow[]): Promise<Map<string, UserRef>> {
  const ownerIds = [...new Set(rows.map((row) => row.created_by))];
  if (ownerIds.length === 0) return new Map();

  const owners = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, ownerIds));
  return new Map(owners.map((owner) => [owner.id, toUserRef(owner)]));
}

async function loadVisibleStationOperators(memberships: UserListMembership[], hiddenCountryCodes: readonly string[]): Promise<OperatorById> {
  const stationIds = [...new Set(memberships.flatMap((membership) => membership.internal))];
  if (stationIds.length === 0) return new Map();

  const rows = await db
    .select({ id: stations.id, operatorId: stations.operator_id })
    .from(stations)
    .where(and(inArray(stations.id, stationIds), ...stationAreaConditions({}, hiddenCountryCodes)));
  return new Map(rows.map((row) => [row.id, row.operatorId]));
}

async function loadOfficialSiteOperators(memberships: UserListMembership[]): Promise<OperatorById> {
  const officialSiteIds = [...new Set(memberships.flatMap((membership) => membership.uke))];
  if (officialSiteIds.length === 0) return new Map();

  const rows = await db
    .select({ id: ukeStations.id, operatorId: ukeStations.operator_id })
    .from(ukeStations)
    .where(inArray(ukeStations.id, officialSiteIds));
  return new Map(rows.map((row) => [row.id, row.operatorId]));
}

function countOperators(operatorIds: (number | null | undefined)[]): ListOperatorCount[] {
  const counts = new Map<number, number>();
  for (const operatorId of operatorIds) {
    if (typeof operatorId === "number") counts.set(operatorId, (counts.get(operatorId) ?? 0) + 1);
  }
  return [...counts].map(([operatorId, count]) => ({ operatorId, count })).sort((a, b) => b.count - a.count || a.operatorId - b.operatorId);
}

export async function toLists(
  rows: UserListRow[],
  viewerId: string | null,
  hiddenCountryCodes: readonly string[],
  include: readonly ListInclude[] = [],
): Promise<List[]> {
  const memberships = rows.map(getUserListMembership);
  const hidesCountries = hiddenCountryCodes.length > 0;
  const countsOperators = include.includes("operatorCounts");
  const [owners, stationOperators, officialSiteOperators] = await Promise.all([
    include.includes("owner") ? loadOwners(rows) : null,
    countsOperators || hidesCountries ? loadVisibleStationOperators(memberships, hiddenCountryCodes) : null,
    countsOperators ? loadOfficialSiteOperators(memberships) : null,
  ]);

  return rows.map((row) => {
    const { internal, uke, radiolines } = getUserListMembership(row);
    const stationIds = stationOperators && hidesCountries ? internal.filter((id) => stationOperators.has(id)) : internal;
    const list = toList(row, viewerId);
    const owner = owners?.get(row.created_by);

    list.itemCounts.stations = stationIds.length;
    if (owner) list.owner = owner;
    if (stationOperators && officialSiteOperators) {
      list.operatorCounts = countOperators([...internal.map((id) => stationOperators.get(id)), ...uke.map((id) => officialSiteOperators.get(id))]);
    }
    if (include.includes("items")) list.items = { stationIds, officialSiteIds: uke, microwaveLinkIds: radiolines };
    return list;
  });
}
