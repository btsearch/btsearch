import { brands, operators, users } from "@openbts/drizzle";
import { DEFAULT_OPERATOR_COLOR } from "@openbts/shared/operatorUtils";
import { eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import { loadPublicOfficialVisibility } from "../official/visibility.js";
import { toLists } from "./serialize.js";

const PREVIEW_OPERATOR_LIMIT = 4;

export type ListPreviewOperator = {
  name: string;
  count: number;
  color: string;
  logoFile: string | null;
};

export type ListPreview = {
  id: string;
  name: string;
  description: string | null;
  ownerUsername: string | null;
  stationCount: number;
  microwaveLinkCount: number;
  operators: ListPreviewOperator[];
  otherOperators: { count: number; stationCount: number } | null;
};

async function loadPreviewOperators(counts: ReadonlyMap<number, number>): Promise<ListPreviewOperator[]> {
  if (counts.size === 0) return [];

  const rows = await db
    .select({ id: operators.id, name: operators.name, color: brands.color, logoFile: brands.logoFile })
    .from(operators)
    .leftJoin(brands, eq(brands.id, operators.brandId))
    .where(inArray(operators.id, [...counts.keys()]));

  return rows
    .map((row) => ({ ...row, count: counts.get(row.id) ?? 0 }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name) || left.id - right.id)
    .map((row) => ({ name: row.name, count: row.count, color: row.color ?? DEFAULT_OPERATOR_COLOR, logoFile: row.logoFile }));
}

export async function loadPublicListPreview(publicId: string): Promise<ListPreview | null> {
  if (!getRuntimeSettings().enableUserLists) return null;

  const row = await db.query.userLists.findFirst({ where: { uuid: publicId } });
  if (!row?.is_public) return null;

  const [visibility, [owner]] = await Promise.all([
    loadPublicOfficialVisibility(),
    db.select({ username: users.username }).from(users).where(eq(users.id, row.created_by)).limit(1),
  ]);
  const [list] = await toLists([row], null, visibility, ["operatorCounts"]);
  if (!list) return null;

  const counts = new Map(list.operatorCounts?.map(({ operatorId, count }): [number, number] => [operatorId, count]));
  const previewOperators = await loadPreviewOperators(counts);
  const otherOperators = previewOperators.slice(PREVIEW_OPERATOR_LIMIT);
  const otherStationCount = otherOperators.reduce((total, operator) => total + operator.count, 0);

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    ownerUsername: owner?.username ?? null,
    stationCount: list.itemCounts.stations + list.itemCounts.officialSites,
    microwaveLinkCount: list.itemCounts.microwaveLinks,
    operators: previewOperators.slice(0, PREVIEW_OPERATOR_LIMIT),
    otherOperators: otherOperators.length > 0 ? { count: otherOperators.length, stationCount: otherStationCount } : null,
  };
}
