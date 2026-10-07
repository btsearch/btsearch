import { InformationCircleIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { useTerrainFormat } from "../format";
import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import type { ReadyTerrainProfile } from "../types";
import { getStaleTextClassName } from "./terrainProfileStyles";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TerrainProfileEvidenceProps = {
  panel: TerrainProfilePanelModel;
  isStacked?: boolean;
};

type ProfileMetricsProps = {
  profile: ReadyTerrainProfile;
  isStale: boolean;
  isStacked: boolean;
};

type MetricProps = {
  label: string;
  value: string;
  description: string;
  isStale: boolean;
};

const PROPAGATION_MODEL_NAME = "ITU-R P.1812-8";
const VALUE_SEPARATOR = " · ";
const MISSING_VALUE = "-";
const EXPLANATION_TRIGGER_CLASS = cn(
  "inline-flex size-6 shrink-0 cursor-help items-center justify-center text-primary",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

function Metric({ label, value, description, isStale }: MetricProps) {
  const { t } = useTranslation("terrainProfile");

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        <Popover>
          <PopoverTrigger openOnHover delay={0} type="button" aria-label={t("metrics.explain", { label })} className={EXPLANATION_TRIGGER_CLASS}>
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent side="top" className="w-[min(18rem,calc(100vw-2rem))] gap-1.5 p-3">
            <PopoverTitle className="text-xs">{label}</PopoverTitle>
            <PopoverDescription className="text-xs leading-relaxed">{description}</PopoverDescription>
          </PopoverContent>
        </Popover>
        <span>{label}</span>
      </span>
      <span className={cn("font-mono text-xs font-medium tabular-nums", getStaleTextClassName(isStale, "text-foreground"))}>{value}</span>
    </span>
  );
}

function ProfileMetrics({ profile, isStale, isStacked }: ProfileMetricsProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const { result, antenna } = profile;
  const { azimuth, elevation } = result.beamOffset;
  const beamOffsets: string[] = [];

  if (elevation !== null) beamOffsets.push(t("metrics.beamOffsetVertical", { value: `${format.signed(elevation, 1)}°` }));
  if (azimuth !== null) beamOffsets.push(t("metrics.beamOffsetHorizontal", { value: `${format.decimal(azimuth, 1)}°` }));

  return (
    <div className={cn("flex text-xs text-muted-foreground", isStacked ? "flex-col gap-0.5" : "flex-wrap items-center gap-x-4 gap-y-0.5")}>
      <Metric
        label={t("metrics.pathLoss")}
        value={`${format.decimal(result.pathLossDb, 1)} dB`}
        description={t("metrics.pathLossDescription")}
        isStale={isStale}
      />
      <Metric
        label={t("metrics.fieldStrength")}
        value={`${format.decimal(result.referenceFieldStrengthDbuvm, 1)} dBµV/m`}
        description={t("metrics.fieldStrengthDescription")}
        isStale={isStale}
      />
      <Metric
        label={t("metrics.beamOffset")}
        value={beamOffsets.length === 0 ? MISSING_VALUE : beamOffsets.join(VALUE_SEPARATOR)}
        description={antenna.tiltSource === "measured" ? t("metrics.beamOffsetDescription") : t("metrics.beamOffsetUnavailableDescription")}
        isStale={isStale}
      />
    </div>
  );
}

function ProfileSources({ profile }: { profile: ReadyTerrainProfile }) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const { result, report } = profile;
  const { source, resolutionMeters } = result.elevationData;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
      <span className="rounded-md bg-muted px-1.5 py-px font-mono text-[10px] font-medium text-foreground">{PROPAGATION_MODEL_NAME}</span>
      <span>{t("evidence.elevation", { source, spacing: format.compact(resolutionMeters, 1) })}</span>
      {report === null ? (
        <span>{t("evidence.noReport")}</span>
      ) : (
        <>
          <a href={report.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            {t("evidence.si2pem", { date: report.measuredOn === null ? t("evidence.latest") : format.day(report.measuredOn) })}
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" aria-hidden="true" />
          </a>
          {report.laboratoryName === null ? null : <span className="min-w-0 truncate">{report.laboratoryName}</span>}
        </>
      )}
    </div>
  );
}

export function TerrainProfileEvidence({ panel, isStacked = false }: TerrainProfileEvidenceProps) {
  const { profile, mode } = panel;
  if (profile === null) return null;

  return (
    <>
      <ProfileMetrics profile={profile} isStale={mode === "calculating"} isStacked={isStacked} />
      <ProfileSources profile={profile} />
    </>
  );
}
