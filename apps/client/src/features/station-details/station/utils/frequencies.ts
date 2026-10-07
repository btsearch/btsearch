import { calcExactFrequency } from "@openbts/shared/frequency";

import type { Cell } from "../types";
import { DUPLEX_MARKS, UNLABELLED_BAND_MHZ, getCellChannel, toRatType } from "./bands";

export function getCellDownlinkFrequency(cell: Cell): string | null {
  const { band } = cell;
  if (band === undefined) return null;

  const duplex = band.duplex === null ? null : DUPLEX_MARKS[band.duplex];
  const downlink = calcExactFrequency(toRatType(cell.rat), band.labelMhz ?? UNLABELLED_BAND_MHZ, getCellChannel(cell), duplex);
  return downlink?.frequency ?? null;
}
