import type { CellApplyNewCell } from "@openbts/shared/contract";

import type { ObservedSiteRecord } from "../../sites/read.js";
import type { Point } from "../../tiles/squares.js";
import type { RaisedFlag } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { isFlagSubject, metersBetween, shownPoint, siteMeasureOf } from "./flaggedSite.js";

export function raiseSuggestedSiteFlag(
  site: ObservedSiteRecord,
  cells: readonly CellApplyNewCell[],
  station: Point | null,
): RaisedFlag<"suggestedSite"> | null {
  const point = shownPoint(site);
  const stationId = site.suggestedStationId;
  if (!isFlagSubject(site) || site.status !== "suggested" || stationId === null || cells.length === 0) return null;
  if (point === null || station === null || site.estimate === null) return null;

  return {
    kind: "suggestedSite",
    subjectKey: observedSiteSubject(site),
    refs: { observedSiteId: site.id, stationId },
    evidence: { distanceMeters: Math.round(metersBetween(point, station)), people: site.estimate.personCount },
    suggestion: { cells: cells.map((cell) => ({ action: "create" as const, ...cell })) },
    measure: siteMeasureOf(site, site.estimate),
  };
}
