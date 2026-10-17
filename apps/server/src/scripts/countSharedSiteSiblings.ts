import "dotenv/config";
import { officialSites, operatorLinks, stations } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { sql } from "drizzle-orm";

import { findSharedSiblingIds } from "../features/stations/sharedSiblings.js";
import type { DbTx } from "../types/global.js";

type CrowdedSite = { id: number; locationId: number; operatorId: number };

function findSitesWithSeveralSiblings(tx: DbTx, sites: typeof stations | typeof officialSites) {
  return tx.execute<CrowdedSite>(sql`
    SELECT site.id, site.location_id AS "locationId", site.operator_id AS "operatorId"
    FROM ${sites} AS site
    INNER JOIN ${operatorLinks} AS membership ON membership.operator_id = site.operator_id AND membership.kind = 'jv_member'
    INNER JOIN ${operatorLinks} AS partner
      ON partner.related_operator_id = membership.related_operator_id AND partner.kind = 'jv_member' AND partner.operator_id <> site.operator_id
    INNER JOIN ${sites} AS sibling ON sibling.location_id = site.location_id AND sibling.operator_id = partner.operator_id
    GROUP BY site.id
    HAVING count(DISTINCT sibling.id) > 1
    ORDER BY site.id
  `);
}

function summarize(kind: string, sites: readonly CrowdedSite[]): string {
  const locationCount = new Set(sites.map((site) => site.locationId)).size;
  return `${kind} with more than one shared sibling at their location: ${sites.length} at ${locationCount} locations`;
}

async function main(): Promise<void> {
  await db.transaction(
    async (tx) => {
      const crowdedStations = await findSitesWithSeveralSiblings(tx, stations);
      const sameEnbSiblings = await Promise.all(crowdedStations.map((station) => findSharedSiblingIds(station, { sameEnb: true }, tx)));
      const withOne = sameEnbSiblings.filter((siblingIds) => siblingIds.length === 1).length;
      const withNone = sameEnbSiblings.filter((siblingIds) => siblingIds.length === 0).length;
      const crowdedOfficialSites = await findSitesWithSeveralSiblings(tx, officialSites);

      console.log(summarize("stations", crowdedStations));
      console.log(`  exactly one sibling has an equivalent eNBID (approval copies to it): ${withOne}`);
      console.log(`  no sibling has an equivalent eNBID (approval copies nothing): ${withNone}`);
      console.log(`  several siblings have an equivalent eNBID (approval copies nothing): ${crowdedStations.length - withOne - withNone}`);
      console.log(summarize("official sites", crowdedOfficialSites));
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}

main()
  .catch((error: unknown) => {
    console.error("count failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });
