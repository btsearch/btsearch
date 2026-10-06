import { AlertCircleIcon, Gps01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { getFailureTextKey } from "../failures";
import { useTerrainFormat } from "../format";
import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { type ProfileHighlight, type ProfileSummary, getProfileHighlight } from "../profileSummary";
import { PATH_DISTANCE_TEXT_VALUES } from "../receiverRange";
import type { ReadyTerrainProfile, TerrainWarning } from "../types";
import { type TerrainPathVerdict, getTerrainPathVerdict, isBlockedBySurfaceOnly } from "../verdict";
import { TerrainProfileGpsButton, TerrainProfileGpsNotice } from "./terrainProfileGpsButton";
import { getStaleTextClassName } from "./terrainProfileStyles";
import { TerrainVerdictIcon, getPathSummary, getShortVerdict, getVerdictSentence } from "./terrainProfileVerdict";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { cn } from "@/lib/utils";

type ListedWarning = Exclude<TerrainWarning, "outsideMainBeam">;

type TerrainProfileStatusProps = {
  panel: TerrainProfilePanelModel;
  isCompact?: boolean;
};

type TerrainProfileNotesProps = {
  profile: ReadyTerrainProfile;
  isStale: boolean;
};

type ResultBlockProps = {
  profile: ReadyTerrainProfile;
  summary: ProfileSummary;
  isStale: boolean;
  isCompact: boolean;
};

type VerdictDetailProps = {
  verdict: TerrainPathVerdict;
  highlight: ProfileHighlight | null;
  isStale: boolean;
  isCompact: boolean;
};

const WARNING_TEXT_KEYS: Record<ListedWarning, string> = {
  emfReportUnavailable: "warnings.codes.SI2PEM_REPORT_UNAVAILABLE",
  emfReportUnreadable: "warnings.codes.SI2PEM_REPORT_PARSE_FAILED",
  antennaFromPermit: "warnings.codes.UKE_ANTENNA_FALLBACK",
  antennaFromSharedNetwork: "warnings.codes.NETWORKS_SHARING_DATA",
  surfaceDataUnavailable: "warnings.codes.SURFACE_MODEL_UNAVAILABLE",
  surfaceDataIncomplete: "warnings.codes.SURFACE_MODEL_PARTIAL",
  terrainDataIncomplete: "warnings.codes.TERRAIN_MODEL_PARTIAL",
  elevationDataStale: "warnings.codes.TERRAIN_CACHE_STALE",
};

const BLOCK_TITLE_CLASS = "text-sm font-semibold leading-5";
const BLOCK_TEXT_CLASS = "mt-1 text-xs leading-[1.0625rem] text-muted-foreground";
const DETAIL_VALUE_CLASS = "font-mono font-semibold tabular-nums";
const NOTE_ICON_TONE_CLASS = "text-amber-600 dark:text-amber-400";

function isListedWarning(warning: TerrainWarning): warning is ListedWarning {
  return warning !== "outsideMainBeam";
}

function listShownWarnings(warnings: readonly TerrainWarning[]): ListedWarning[] {
  const hasPermitFallback = warnings.includes("antennaFromPermit");
  const listed = warnings.filter(isListedWarning);
  if (!hasPermitFallback) return listed;
  return listed.filter((warning) => warning !== "emfReportUnavailable" && warning !== "emfReportUnreadable");
}

export function TerrainProfileNotes({ profile, isStale }: TerrainProfileNotesProps) {
  const { t } = useTranslation("terrainProfile");
  const { result } = profile;
  const beamOffsetDegrees = result.beamOffset.azimuth;
  const notes: string[] = [];

  if (isBlockedBySurfaceOnly(result)) notes.push(t("verdict.surfaceOnly"));
  if (result.warnings.includes("outsideMainBeam") && beamOffsetDegrees !== null) {
    notes.push(t("warnings.outsideMainBeam", { degrees: Math.round(Math.abs(beamOffsetDegrees)) }));
  }
  for (const warning of listShownWarnings(result.warnings)) notes.push(t(WARNING_TEXT_KEYS[warning]));
  if (notes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((note) => (
        <li key={note} className={cn("flex items-start gap-1.5 text-xs leading-4", getStaleTextClassName(isStale))}>
          <HugeiconsIcon
            icon={AlertCircleIcon}
            className={cn("mt-px size-3.5 shrink-0", getStaleTextClassName(isStale, NOTE_ICON_TONE_CLASS))}
            aria-hidden="true"
          />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}

function VerdictDetail({ verdict, highlight, isStale, isCompact }: VerdictDetailProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();

  if (highlight === null || (highlight.kind === "obstruction" && highlight.depthMeters === null)) {
    if (isCompact || verdict === "clear") return null;
    const description = verdict === "blocked" ? t("verdict.description.blocked") : t("verdict.description.unavailable");
    return <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{description}</p>;
  }

  const isObstruction = highlight.kind === "obstruction";
  const label = isObstruction ? t("verdict.obstructionDepth") : t("verdict.minimumClearance");
  const meters = highlight.kind === "obstruction" ? (highlight.depthMeters ?? 0) : highlight.clearanceMeters;
  const valueToneClass = isObstruction ? "text-destructive" : "text-foreground";
  const value = <span className={cn(DETAIL_VALUE_CLASS, getStaleTextClassName(isStale, valueToneClass))}>{`${format.decimal(meters, 1)} m`}</span>;

  if (isCompact) {
    return (
      <span>
        {" · "}
        {label} {value}
      </span>
    );
  }

  return (
    <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
      {label} {value}
      {" · "}
      {t("distanceFromStation", { value: format.decimal(highlight.distanceMeters / 1000, 2) })}
    </p>
  );
}

function ResultBlock({ profile, summary, isStale, isCompact }: ResultBlockProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const { result } = profile;
  const verdict = getTerrainPathVerdict(result);
  const highlight = getProfileHighlight(result, summary, verdict);
  const pathSummary = getPathSummary(result, format, t);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <TerrainVerdictIcon verdict={verdict} isStale={isStale} className="mt-px size-5" />
        {isCompact ? (
          <div className="min-w-0">
            <p className={cn(BLOCK_TITLE_CLASS, getStaleTextClassName(isStale))}>{getShortVerdict(verdict, t)}</p>
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
              <span className="font-mono tabular-nums">{pathSummary}</span>
              <VerdictDetail verdict={verdict} highlight={highlight} isStale={isStale} isCompact />
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className={cn(BLOCK_TITLE_CLASS, getStaleTextClassName(isStale))}>{getVerdictSentence(verdict, t)}</p>
            <p className="mt-0.5 font-mono text-xs leading-4 tabular-nums text-muted-foreground">{pathSummary}</p>
            <VerdictDetail verdict={verdict} highlight={highlight} isStale={isStale} isCompact={false} />
          </div>
        )}
      </div>
      {isCompact ? null : <TerrainProfileNotes profile={profile} isStale={isStale} />}
    </div>
  );
}

function PlacingBlock({ panel }: { panel: TerrainProfilePanelModel }) {
  const { t } = useTranslation("terrainProfile");

  return (
    <div className="flex items-start gap-2">
      <HugeiconsIcon icon={Gps01Icon} className="mt-px size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className={BLOCK_TITLE_CLASS}>{t("placing.title")}</p>
        <p className={BLOCK_TEXT_CLASS}>{t("placing.description", PATH_DISTANCE_TEXT_VALUES)}</p>
        <TerrainProfileGpsButton panel={panel} className="mt-2.5" />
        <TerrainProfileGpsNotice gpsError={panel.gpsError} isReceiverPlaced={false} className="mt-2" />
      </div>
    </div>
  );
}

function FirstRunBlock() {
  const { t } = useTranslation("terrainProfile");

  return (
    <div className="flex items-start gap-2">
      <LoadingIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className={BLOCK_TITLE_CLASS}>{t("states.calculating")}</p>
        <p className={BLOCK_TEXT_CLASS}>{t("states.processing")}</p>
      </div>
    </div>
  );
}

function FailureBlock({ panel }: { panel: TerrainProfilePanelModel }) {
  const { t } = useTranslation("terrainProfile");
  const { failure } = panel;
  if (failure === null) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <InlineError className="w-full" title={t("states.failed")} description={t(getFailureTextKey(failure), PATH_DISTANCE_TEXT_VALUES)} />
      {panel.canRetry ? (
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={panel.retry}>
          <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" aria-hidden="true" />
          {t("actions.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function TerrainProfileStatus({ panel, isCompact = false }: TerrainProfileStatusProps) {
  const { mode, profile, summary } = panel;
  if (mode === "failed") return <FailureBlock panel={panel} />;

  return (
    <div role="status">
      {mode === "placing" ? <PlacingBlock panel={panel} /> : null}
      {mode === "firstRun" ? <FirstRunBlock /> : null}
      {profile !== null && summary !== null ? (
        <ResultBlock profile={profile} summary={summary} isStale={mode === "calculating"} isCompact={isCompact} />
      ) : null}
    </div>
  );
}
