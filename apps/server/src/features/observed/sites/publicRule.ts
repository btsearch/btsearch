import { OBSERVED_SITE_NOT_PUBLIC_REASONS } from "@openbts/shared/contract";
import type { ObservedSiteNotPublicReason } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export const MIN_SNAP_PROBABILITY = 0.5;
const MIN_UNMATCHED_FARTHEST_M = 300;

type SiteFacts = {
  retiredAt: SQLWrapper;
  status: SQL;
  point: SQL;
  alternativePoint: SQL;
  isConfirmed: SQL;
  isConsistent: SQL;
  isSnapped: SQL;
  snapProbability: SQLWrapper;
  uncertaintyM: SQL;
  publicRadiusMaxM: SQLWrapper;
  maxDistanceM: SQL;
  isCountryShown: SQL;
};

function notPublicConditions(site: SiteFacts): Record<ObservedSiteNotPublicReason, SQL> {
  const isPlacedClosely = sql`CASE
    WHEN ${site.isSnapped} THEN ${site.snapProbability} >= ${MIN_SNAP_PROBABILITY}
    ELSE ${site.uncertaintyM} <= ${site.publicRadiusMaxM}
  END`;
  return {
    replaced: sql`${site.retiredAt} IS NOT NULL`,
    ignored: sql`${site.status} = 'ignored'`,
    notEstimated: sql`${site.point} IS NULL`,
    unconfirmed: sql`NOT (${site.isConfirmed} OR ${site.status} = 'matched')`,
    looseFit: sql`NOT (${site.alternativePoint} IS NULL AND ${site.isConsistent} AND ${isPlacedClosely})`,
    possibleSmallCell: sql`(${site.status} <> 'matched' AND ${site.maxDistanceM} < ${MIN_UNMATCHED_FARTHEST_M})`,
    privateCountry: sql`NOT ${site.isCountryShown}`,
  };
}

export function publicRule(site: SiteFacts): { isPublic: SQL<boolean>; notPublicReasons: SQL<ObservedSiteNotPublicReason[]> } {
  const notPublicBecause = notPublicConditions(site);
  const anyReason = sql.join(
    OBSERVED_SITE_NOT_PUBLIC_REASONS.map((reason) => notPublicBecause[reason]),
    sql` OR `,
  );
  const reasons = sql.join(
    OBSERVED_SITE_NOT_PUBLIC_REASONS.map((reason) => sql`CASE WHEN ${notPublicBecause[reason]} THEN ${reason} END`),
    sql`, `,
  );
  return {
    isPublic: sql<boolean>`NOT (${anyReason})`,
    notPublicReasons: sql<ObservedSiteNotPublicReason[]>`array_remove(ARRAY[${reasons}]::text[], NULL)`,
  };
}
