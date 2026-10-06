import { locations, proposedLocations, regions, roleGrantRegions, ukeLocations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditRecorder } from "../audit/index.js";
import type { RegionRow } from "./serialize.js";

export async function removeRegion(tx: DbTx, audit: AuditRecorder, region: RegionRow): Promise<void> {
  const [[location], [ukeLocation], [proposedLocation], [grant]] = await Promise.all([
    tx.select({ id: locations.id }).from(locations).where(eq(locations.region_id, region.id)).limit(1),
    tx.select({ id: ukeLocations.id }).from(ukeLocations).where(eq(ukeLocations.region_id, region.id)).limit(1),
    tx.select({ id: proposedLocations.id }).from(proposedLocations).where(eq(proposedLocations.region_id, region.id)).limit(1),
    tx.select({ id: roleGrantRegions.grantId }).from(roleGrantRegions).where(eq(roleGrantRegions.regionId, region.id)).limit(1),
  ]);
  if (location || ukeLocation || proposedLocation) {
    throw new ErrorResponse("CONFLICT", { message: "Cannot delete a region that still has locations" });
  }
  if (grant) throw new ErrorResponse("CONFLICT", { message: "Cannot delete a region that an editor grant is limited to" });

  await tx.delete(regions).where(eq(regions.id, region.id));
  await audit.log({ entity: "regions", op: "delete", recordId: region.id, old: region });
}
