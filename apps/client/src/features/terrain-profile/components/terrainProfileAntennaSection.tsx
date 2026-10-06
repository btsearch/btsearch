import type { Band } from "@openbts/shared/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type LabeledAntenna, findSelectedAntenna, getReceiverBearing, isOmnidirectional, listAntennaChoices } from "../antennaSelection";
import { useTerrainFormat } from "../format";
import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import type { TerrainAntenna } from "../types";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { FacetDisclosurePill, FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { ratToGenLabel } from "@/features/shared/rat";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { formatBandMhzLabel } from "@/features/station-details/station/utils/bands";
import { cn } from "@/lib/utils";

type AntennaPillProps = {
  choice: LabeledAntenna;
  generation: string | null;
  isSelected: boolean;
  onSelect: (antennaKey: string) => void;
};

const LABEL_SEPARATOR = " · ";

function findBand(bandsById: ReadonlyMap<number, Band> | undefined, antenna: TerrainAntenna): Band | undefined {
  return antenna.bandId === null ? undefined : bandsById?.get(antenna.bandId);
}

function getBandLabel(antenna: TerrainAntenna, band: Band | undefined, language: string): string {
  if (band === undefined || band.labelMhz === null) return String(Math.round(antenna.frequencyMhz));
  return formatBandMhzLabel(band.labelMhz, language);
}

function AutoSelectedMark({ isShown }: { isShown: boolean }) {
  const { t } = useTranslation("terrainProfile");

  return (
    <span
      aria-hidden={!isShown}
      className={cn(
        "inline-flex h-4 items-center rounded-[5px] bg-primary/12 px-[5px] text-[10px] leading-none font-semibold text-primary",
        "transition-opacity duration-150 motion-reduce:transition-none",
        isShown ? "opacity-100" : "opacity-0",
      )}
    >
      {t("antenna.autoSelected")}
    </span>
  );
}

function AntennaPill({ choice, generation, isSelected, onSelect }: AntennaPillProps) {
  return (
    <FacetPill
      active={isSelected}
      onClick={() => onSelect(choice.antenna.key)}
      className={cn("cursor-pointer tabular-nums", generation === null ? null : "pl-1.5")}
    >
      {generation === null ? null : <GenerationTag active={isSelected}>{generation}</GenerationTag>}
      <span>{choice.label}</span>
    </FacetPill>
  );
}

export function TerrainProfileAntennaSection({ panel }: { panel: TerrainProfilePanelModel }) {
  const { t, i18n } = useTranslation(["terrainProfile", "stationDetails", "main"]);
  const format = useTerrainFormat();
  const { lookups } = useMapLookups();
  const [isUnfolded, setIsUnfolded] = useState(false);
  const { profile, receiverPoint, station, selectAntenna } = panel;
  const bandsById = lookups?.bandsById;
  if (profile === null || receiverPoint === null) return null;

  function describeAntenna(antenna: TerrainAntenna, withHeight: boolean): string {
    const parts = [getBandLabel(antenna, findBand(bandsById, antenna), i18n.language)];
    if (isOmnidirectional(antenna)) parts.push(t("stationDetails:sectors.omnidirectional"));
    else if (antenna.azimuth !== null) parts.push(`${format.compact(antenna.azimuth, 1)}°`);
    if (withHeight) parts.push(`${format.compact(antenna.heightMeters, 1)} m`);
    return parts.join(LABEL_SEPARATOR);
  }

  function getGeneration(antenna: TerrainAntenna): string | null {
    const band = findBand(bandsById, antenna);
    return band === undefined ? null : ratToGenLabel(band.rat.toUpperCase());
  }

  const selected = findSelectedAntenna(profile, panel.selectedAntennaKey);
  const { offered, folded } = listAntennaChoices(profile.candidates, selected, getReceiverBearing(station, receiverPoint), describeAntenna);
  const { report } = profile;
  const meta = [t("antenna.height", { value: format.decimal(selected.heightMeters, 1) })];
  if (selected.tilt !== null) meta.push(t("selection.tilt", { value: format.compact(selected.tilt, 1) }));
  if (selected.source === "permit") meta.push(t("antenna.source.permit"));
  else if (report === null || report.measuredOn === null) meta.push(t("antenna.source.emfReport"));
  else meta.push(t("antenna.source.emfReportDated", { date: format.day(report.measuredOn) }));

  function renderPill(choice: LabeledAntenna) {
    const { antenna } = choice;
    return (
      <AntennaPill
        key={antenna.key}
        choice={choice}
        generation={getGeneration(antenna)}
        isSelected={antenna.key === selected.key}
        onSelect={selectAntenna}
      />
    );
  }

  return (
    <FilterPanelSection title={t("antenna.title")} hint={<AutoSelectedMark isShown={panel.isAntennaAutomatic} />}>
      <div className="flex flex-wrap gap-1.5">
        {offered.map(renderPill)}
        {folded.length > 0 ? (
          <FacetDisclosurePill
            expanded={isUnfolded}
            label={isUnfolded ? t("antenna.collapseList") : t("antenna.showOthers", { total: folded.length })}
            onClick={() => setIsUnfolded((current) => !current)}
          >
            {isUnfolded ? t("main:filters.collapse") : `+${folded.length}`}
          </FacetDisclosurePill>
        ) : null}
        {isUnfolded ? folded.map(renderPill) : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{meta.join(LABEL_SEPARATOR)}</p>
    </FilterPanelSection>
  );
}
