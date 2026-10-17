import { officialPermits, officialSites } from "@openbts/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { OperatorRef } from "../../../core/conventions.ts";
import type { CellMatchContext } from "../../../core/sources.ts";
import { splitFirstDigit } from "../../conventions/networks.ts";
import { ORANGE_PLMN, PLUS_PLMN, TMOBILE_PLMN } from "../../operators.ts";
import { bucketOf, chunk } from "./shared/collections.ts";

type PermitMatch = { siteId: number; operatorId: number; fragment: string };

const FRAGMENTS_PER_STATEMENT = 500;
const PLMNS_WITH_ENBID_IN_DECISION_NUMBER = new Set<string | null>([PLUS_PLMN, TMOBILE_PLMN, ORANGE_PLMN]);

const thirdPartOfDecisionNumber = sql<string>`split_part(${officialPermits.decision_number}, '/', 3)`;

export function decisionFragments(operator: OperatorRef, enbid: number): string[] {
  if (!PLMNS_WITH_ENBID_IN_DECISION_NUMBER.has(operator.primaryPlmn)) return [];
  if (enbid <= 9) return [String(enbid)];

  const { withoutFirstDigit } = splitFirstDigit(enbid);
  const candidates = operator.primaryPlmn === PLUS_PLMN ? [enbid, withoutFirstDigit] : [withoutFirstDigit, enbid];
  return candidates.map(String);
}

async function findPermitMatches(db: CellMatchContext["db"], fragments: readonly string[], operatorIds: readonly number[]): Promise<PermitMatch[]> {
  const matches: PermitMatch[] = [];
  for (const fragmentGroup of chunk(fragments, FRAGMENTS_PER_STATEMENT)) {
    // oxlint-disable-next-line no-await-in-loop -- one statement at a time, so a long log does not take every connection
    const rows = await db
      .selectDistinct({ siteId: officialSites.id, operatorId: officialSites.operator_id, fragment: thirdPartOfDecisionNumber })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
      .where(and(inArray(thirdPartOfDecisionNumber, fragmentGroup), inArray(officialSites.operator_id, operatorIds)));
    matches.push(...rows);
  }

  return matches.sort((a, b) => a.siteId - b.siteId);
}

export async function findOfficialSiteIdsForCells({ db, cells }: CellMatchContext): Promise<number[][]> {
  const searches = cells.map((cell) => {
    const fragments = decisionFragments(cell.operator, cell.enbid);
    return { fragments, operatorIds: fragments.length > 0 ? cell.operatorIds : [] };
  });
  const fragments = [...new Set(searches.flatMap((search) => search.fragments))];
  const operatorIds = [...new Set(searches.flatMap((search) => search.operatorIds))];
  if (fragments.length === 0 || operatorIds.length === 0) return cells.map(() => []);

  const matches = await findPermitMatches(db, fragments, operatorIds);
  const siteIdsByOperatorAndFragment = new Map<string, number[]>();
  for (const { siteId, operatorId, fragment } of matches) bucketOf(siteIdsByOperatorAndFragment, `${operatorId}:${fragment}`).push(siteId);

  return searches.map((search) => {
    const keys = search.operatorIds.flatMap((operatorId) => search.fragments.map((fragment) => `${operatorId}:${fragment}`));
    return [...new Set(keys.flatMap((key) => siteIdsByOperatorAndFragment.get(key) ?? []))];
  });
}
