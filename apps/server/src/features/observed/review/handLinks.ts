import { siteLinks } from "@openbts/drizzle";
import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { AuditRecorder } from "../../audit/index.js";

const siteLinkSelectSchema = createSelectSchema(siteLinks);

export type SiteLinkRow = z.infer<typeof siteLinkSelectSchema>;

export async function saveHandLinks(
  audit: AuditRecorder,
  siteIds: readonly number[],
  stationId: number,
  stored: readonly SiteLinkRow[],
  actorId: string | null,
): Promise<number> {
  const storedBySite = new Map(stored.map((link) => [link.observedSiteId, link]));
  const isKept = (siteId: number) => {
    const link = storedBySite.get(siteId);
    return link !== undefined && link.linkedById !== null && link.kind === "matched" && link.stationId === stationId;
  };
  const changed = siteIds.filter((siteId) => !isKept(siteId));
  if (changed.length === 0) return 0;

  const saved = await audit.tx
    .insert(siteLinks)
    .values(changed.map((observedSiteId) => ({ observedSiteId, stationId, kind: "matched" as const, linkedById: actorId })))
    .onConflictDoUpdate({
      target: siteLinks.observedSiteId,
      set: { stationId: sql`excluded.station_id`, kind: sql`excluded.kind`, linkedById: sql`excluded.linked_by_id`, linkedAt: sql`now()` },
    })
    .returning();
  await audit.logMany(
    saved.map((link) => {
      const old = storedBySite.get(link.observedSiteId);
      return {
        entity: "site_links",
        op: old === undefined ? "create" : "update",
        recordId: link.observedSiteId,
        stationId,
        old: old ?? null,
        new: link,
      };
    }),
  );
  return saved.length;
}

export async function deleteHandLinks(audit: AuditRecorder, siteIds: readonly number[]): Promise<number> {
  const deleted = await audit.tx
    .delete(siteLinks)
    .where(and(inArray(siteLinks.observedSiteId, [...siteIds]), isNotNull(siteLinks.linkedById)))
    .returning();
  await audit.logMany(
    deleted.map((link) => ({ entity: "site_links", op: "delete", recordId: link.observedSiteId, stationId: link.stationId, old: link })),
  );
  return deleted.length;
}
