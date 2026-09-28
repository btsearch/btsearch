import { stationSectors } from "@openbts/drizzle";
import { eq } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";

type SectorAzimuth = { id: number; azimuth: number };

function freeAzimuth(unavailable: ReadonlySet<number>): number {
  for (let azimuth = 0; azimuth <= 360; azimuth++) if (!unavailable.has(azimuth)) return azimuth;
  throw new ErrorResponse("BAD_REQUEST", { message: "No free azimuth left to rearrange the station azimuths" });
}

export async function moveSectorsOutOfTheWay(
  tx: DbTx,
  currentSectors: readonly SectorAzimuth[],
  finalAzimuthById: ReadonlyMap<number, number>,
  insertedAzimuths: Iterable<number>,
): Promise<void> {
  const neededAzimuths = new Set(insertedAzimuths);
  for (const sector of currentSectors) {
    const finalAzimuth = finalAzimuthById.get(sector.id);
    if (finalAzimuth !== undefined && finalAzimuth !== sector.azimuth) neededAzimuths.add(finalAzimuth);
  }

  const blockers = currentSectors.filter((sector) => neededAzimuths.has(sector.azimuth) && finalAzimuthById.get(sector.id) !== sector.azimuth);
  const unavailable = new Set([...currentSectors.map((sector) => sector.azimuth), ...neededAzimuths]);

  /* eslint-disable no-await-in-loop */
  for (const blocker of blockers) {
    const parkedAzimuth = freeAzimuth(unavailable);
    unavailable.add(parkedAzimuth);
    await tx.update(stationSectors).set({ azimuth: parkedAzimuth }).where(eq(stationSectors.id, blocker.id));
  }
  /* eslint-enable no-await-in-loop */
}
