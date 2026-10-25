import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StationSightings } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationRecord } from "../types";
import { CoverageCellList } from "./coverageCellList";
import { findBusiestBand } from "./measuredCells";
import { formatDayMonth } from "./measurementFormat";
import { type StationMeasurements, useStationMeasurements } from "./useStationMeasurements";
import { CollapsibleSection } from "@/components/content/collapsibleSection";
import { entityPageChipClassName } from "@/components/content/entityPage";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
  type MeasuredCoverageBandId,
  type StationCoverageTarget,
  chooseMeasuredCoverageBand,
  chooseMeasuredCoverageCell,
  hideMeasuredCoverage,
  showMeasuredCoverage,
  showRequestedStationCoverage,
  useCanShowMeasuredCoverage,
  useMeasuredCoverage,
} from "@/features/map/crowd/coverage/coverageStore";
import { readCoverageView } from "@/features/map/crowd/coverage/coverageView";
import { getStationCoverageMapHash } from "@/features/map/mapLinks";
import { useIsMobile } from "@/hooks/useMobile";
import { formatShortUtcDate } from "@/lib/format";

type MeasuredCoveragePanelProps = {
  station: StationRecord;
  sectionTitle?: string;
  onClose?: () => void;
};

type CoverageBodyProps = {
  station: StationRecord;
  target: StationCoverageTarget;
  measurements: StationMeasurements;
  onClose?: () => void;
};

const COLLAPSIBLE_CLASS =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none";

function describeSeenDays(sightings: StationSightings, language: string, t: TFunction): string {
  const last = formatShortUtcDate(sightings.lastSeenOn, language);
  if (sightings.firstSeenOn === sightings.lastSeenOn) return t("measurements.coverage.seenOnce", { date: last });
  const isSameYear = sightings.firstSeenOn.slice(0, 4) === sightings.lastSeenOn.slice(0, 4);
  const first = isSameYear ? formatDayMonth(sightings.firstSeenOn, language) : formatShortUtcDate(sightings.firstSeenOn, language);
  return t("measurements.coverage.seenRange", { first, last });
}

export function MeasuredCoveragePanel({ station, sectionTitle, onClose }: MeasuredCoveragePanelProps) {
  const measurements = useStationMeasurements(station);
  const canShowOnMap = useCanShowMeasuredCoverage();
  const { target } = measurements;

  if (measurements.state === "unavailable" || target === null) return null;
  const panel = canShowOnMap ? (
    <SwitchedCoverage station={station} target={target} measurements={measurements} onClose={onClose} />
  ) : (
    <LinkedCoverage station={station} target={target} measurements={measurements} onClose={onClose} />
  );
  return sectionTitle === undefined ? panel : <CollapsibleSection title={sectionTitle}>{panel}</CollapsibleSection>;
}

function SwitchedCoverage({ station, target, measurements, onClose }: CoverageBodyProps) {
  const { t, i18n } = useTranslation(["stationDetails", "main", "common"]);
  const coverage = useMeasuredCoverage();
  const isMobile = useIsMobile();

  const showRequestedCoverage = useEffectEvent(() => {
    if (showRequestedStationCoverage(target) && isMobile) onClose?.();
  });

  useEffect(() => {
    showRequestedCoverage();
  }, [station.id]);

  const isOn = coverage !== null && coverage.target.kind === "station" && coverage.target.stationId === station.id;
  const view = isOn ? readCoverageView(measurements.bands, coverage) : null;
  const changeCoverage = (checked: boolean) => {
    if (checked) showMeasuredCoverage(target, { bandId: findBusiestBand(measurements.bands)?.bandId });
    else hideMeasuredCoverage();
  };

  return (
    <section aria-label={t("main:crowd.coverage.title")} className="@container overflow-hidden rounded-xl border">
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("main:crowd.coverage.title")}</span>
          {station.sightings ? (
            <span className="block text-xs text-muted-foreground">{describeSeenDays(station.sightings, i18n.language, t)}</span>
          ) : null}
        </span>
        <Switch checked={isOn} onCheckedChange={changeCoverage} />
      </label>
      <Collapsible open={isOn}>
        <CollapsibleContent className={COLLAPSIBLE_CLASS}>
          <CoverageCellList
            measurements={measurements}
            band={view?.band ?? findBusiestBand(measurements.bands) ?? null}
            chosenCellId={view?.chosenCell?.record.id ?? null}
            sectorsByCellId={target.sectorsByCellId}
            mode={{ kind: "switch", onChoose: chooseMeasuredCoverageCell }}
            onChooseBand={(band) => chooseMeasuredCoverageBand(band.bandId)}
            action={
              isMobile && onClose !== undefined ? (
                <div className="px-4 pb-3">
                  <Button type="button" variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
                    <HugeiconsIcon icon={MapsLocation01Icon} data-icon="inline-start" aria-hidden="true" />
                    {t("common:actions.showOnMap")}
                  </Button>
                </div>
              ) : null
            }
          />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function LinkedCoverage({ station, target, measurements, onClose }: CoverageBodyProps) {
  const { t, i18n } = useTranslation(["stationDetails", "main"]);
  const [chosenBandId, setChosenBandId] = useState<MeasuredCoverageBandId | undefined>(undefined);
  const { bands } = measurements;
  const band = bands.find((entry) => entry.bandId === chosenBandId) ?? findBusiestBand(bands) ?? null;
  const getHash = (observedCellId: number | null) =>
    getStationCoverageMapHash({ stationId: station.id, bandId: band?.bandId, observedCellId }, target);

  return (
    <section aria-label={t("main:crowd.coverage.title")} className="@container overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        {station.sightings ? <span className="text-xs text-muted-foreground">{describeSeenDays(station.sightings, i18n.language, t)}</span> : null}
        <Link to="/" hash={getHash(null)} onClick={onClose} className={entityPageChipClassName}>
          <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" aria-hidden="true" />
          {t("measurements.coverage.showOnMap")}
        </Link>
      </div>
      <CoverageCellList
        measurements={measurements}
        band={band}
        chosenCellId={null}
        sectorsByCellId={target.sectorsByCellId}
        mode={{ kind: "page", getHash, onOpen: onClose }}
        onChooseBand={(chosen) => setChosenBandId(chosen.bandId)}
      />
    </section>
  );
}
