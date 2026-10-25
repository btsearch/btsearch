import { destinationPoint } from "@openbts/shared/geo";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useCalmTransition } from "../../components/search-overlay/mapFilterMotion";
import { type MeasuredCoverageTarget, chooseMeasuredCoverageCell } from "./coverageStore";
import type { MeasuredCoverageCell, MeasuredCoverageView } from "./coverageView";
import { MapMarker, MarkerContent } from "@/components/ui/map";

type CoverageCellLabelsProps = {
  target: MeasuredCoverageTarget | null;
  view: MeasuredCoverageView | null;
};

const LABEL_REACH_SHARE = 0.45;
const LABEL_SHOWN = { opacity: 1 } as const;
const LABEL_HIDDEN = { opacity: 0 } as const;
const LABEL_GROUP_DEGREES = 20;

type LabelGroup = { bearingDegrees: number; reachMeters: number; cells: MeasuredCoverageCell[] };

function angleBetween(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function groupByBearing(cells: readonly MeasuredCoverageCell[]): LabelGroup[] {
  const groups: LabelGroup[] = [];
  for (const cell of cells) {
    const { geometry } = cell.record;
    if (geometry === null) continue;
    const group = groups.find((entry) => angleBetween(entry.bearingDegrees, geometry.bearingDegrees) < LABEL_GROUP_DEGREES);
    if (group === undefined) {
      groups.push({ bearingDegrees: geometry.bearingDegrees, reachMeters: geometry.reachMeters, cells: [cell] });
      continue;
    }
    group.cells.push(cell);
    group.reachMeters = Math.min(group.reachMeters, geometry.reachMeters);
  }
  return groups;
}

export function CoverageCellLabels({ target, view }: CoverageCellLabelsProps) {
  const { t } = useTranslation("main");
  const transition = useCalmTransition();
  const chosenCell = view?.chosenCell ?? null;
  const cells = chosenCell === null ? (view?.band?.cells ?? []) : [chosenCell];
  const groups = target === null ? [] : groupByBearing(cells);

  return (
    <AnimatePresence>
      {target === null
        ? null
        : groups.map((group) => {
            const [latitude, longitude] = destinationPoint(
              target.latitude,
              target.longitude,
              group.bearingDegrees,
              group.reachMeters * LABEL_REACH_SHARE,
            );
            return (
              <MapMarker key={group.cells.map((cell) => cell.record.id).join("-")} latitude={latitude} longitude={longitude}>
                <MarkerContent>
                  <motion.div
                    initial={LABEL_HIDDEN}
                    animate={LABEL_SHOWN}
                    exit={LABEL_HIDDEN}
                    transition={transition}
                    className="flex flex-col items-center"
                  >
                    {group.cells.map((cell) => (
                      <button
                        key={cell.record.id}
                        type="button"
                        aria-pressed={chosenCell?.record.id === cell.record.id}
                        aria-label={t("crowd.coverage.showCell", { cell: cell.label })}
                        onClick={() => chooseMeasuredCoverageCell(cell.record.id)}
                        className="cursor-pointer rounded px-1 py-0.5 text-xs leading-4 font-bold whitespace-nowrap text-foreground underline-offset-2 outline-none [text-shadow:0_0_2px_var(--background),0_0_2px_var(--background),0_0_3px_var(--background),0_0_4px_var(--background)] hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        {cell.label}
                      </button>
                    ))}
                  </motion.div>
                </MarkerContent>
              </MapMarker>
            );
          })}
    </AnimatePresence>
  );
}
