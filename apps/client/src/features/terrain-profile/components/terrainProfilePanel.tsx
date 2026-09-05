import {
  AlertCircleIcon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Location01Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TERRAIN_RECEIVER_BOUNDS } from "@openbts/shared/terrainProfile";
import { type HTMLAttributes, Suspense, lazy, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { getOperatorColor, getOperatorColorByName, resolveOperatorMnc } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

import { filterTerrainProfileCandidatesByBearing } from "../antennaSelection";
import {
  type TerrainProfileAnalysis,
  type TerrainProfileAntennaCandidate,
  type TerrainProfileClearanceStatus,
  type TerrainProfileGpsError,
  type TerrainProfileReceiver,
  type TerrainProfileSample,
  type TerrainProfileStationTarget,
  samplesFromArrays,
} from "../types";

const TerrainProfileChart = lazy(() => import("./terrainProfileChart"));

type TerrainProfilePanelProps = {
  analysis: TerrainProfileAnalysis | null;
  station: TerrainProfileStationTarget | null;
  receiver: TerrainProfileReceiver | null;
  antennaKey?: string;
  isWorking: boolean;
  isLocating: boolean;
  gpsError: TerrainProfileGpsError | null;
  error: Error | null;
  headerDragProps?: HTMLAttributes<HTMLDivElement>;
  onClose: () => void;
  onRetry: () => void;
  onUseCurrentLocation: () => void;
  onReceiverHeightChange: (mountedHeight: number) => void;
  onAntennaChange: (antennaKey: string) => void;
  onHoverSample: (sample: TerrainProfileSample | null) => void;
};

const VERDICT_ICON: Record<TerrainProfileClearanceStatus, typeof CheckmarkCircle02Icon> = {
  clear: CheckmarkCircle02Icon,
  constrained: AlertCircleIcon,
  blocked: MultiplicationSignCircleIcon,
  unavailable: AlertCircleIcon,
};

const VERDICT_TEXT: Record<TerrainProfileClearanceStatus, string> = {
  clear: "text-emerald-600 dark:text-emerald-400",
  constrained: "text-amber-600 dark:text-amber-400",
  blocked: "text-destructive",
  unavailable: "text-muted-foreground",
};

function candidateLabel(candidate: TerrainProfileAntennaCandidate, tiltLabel: string | null) {
  const parts = [
    `${candidate.band?.value ?? candidate.frequencyMHz} MHz`,
    candidate.antenna.azimuth === null ? null : `${candidate.antenna.azimuth}°`,
    tiltLabel,
    `${candidate.antenna.mountedHeight} m`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : candidate.key;
}

function resolveSwatchColor(hasStation: boolean, operatorMnc: number | null, operatorLabel: string | undefined): string | undefined {
  if (!hasStation) return undefined;
  if (operatorMnc !== null) return getOperatorColor(operatorMnc);
  if (operatorLabel !== undefined) return getOperatorColorByName(operatorLabel);
  return undefined;
}

function InlineMetric({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        {description !== undefined ? (
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={0}
              type="button"
              aria-label={description}
              className="inline-flex size-6 shrink-0 cursor-help items-center justify-center text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent side="top" className="w-[min(18rem,calc(100vw-2rem))] gap-1.5 p-3">
              <PopoverTitle className="text-xs">{label}</PopoverTitle>
              <PopoverDescription className="text-xs leading-relaxed">{description}</PopoverDescription>
            </PopoverContent>
          </Popover>
        ) : null}
        <span>{label}</span>
      </span>
      <span className="font-mono text-xs font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function ReceiverHeightField({ receiver, onCommit }: { receiver: TerrainProfileReceiver | null; onCommit: (height: number) => void }) {
  const { t } = useTranslation("terrainProfile");
  const [value, setValue] = useState(() => String(receiver?.mountedHeight ?? 5));
  const [prevHeightAgl, setPrevHeightAgl] = useState(receiver?.mountedHeight);
  if (receiver?.mountedHeight !== prevHeightAgl) {
    setPrevHeightAgl(receiver?.mountedHeight);
    setValue(String(receiver?.mountedHeight ?? 5));
  }

  const commit = () => {
    const height = Number(value);
    if (!Number.isFinite(height) || height < TERRAIN_RECEIVER_BOUNDS.mountedHeight.min || height > TERRAIN_RECEIVER_BOUNDS.mountedHeight.max) {
      setValue(String(receiver?.mountedHeight ?? 5));
      return;
    }
    onCommit(height);
  };

  return (
    <label className="flex items-center gap-1.5">
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">{t("receiver.height")}</span>
      <div className="relative w-20">
        <Input
          type="number"
          min={TERRAIN_RECEIVER_BOUNDS.mountedHeight.min}
          max={TERRAIN_RECEIVER_BOUNDS.mountedHeight.max}
          step={0.1}
          value={value}
          aria-label={t("receiver.height")}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-7 pr-6 font-mono text-xs tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m</span>
      </div>
    </label>
  );
}

export default function TerrainProfilePanel({
  analysis,
  station,
  receiver,
  antennaKey,
  isWorking,
  isLocating,
  gpsError,
  error,
  headerDragProps,
  onClose,
  onRetry,
  onUseCurrentLocation,
  onReceiverHeightChange,
  onAntennaChange,
  onHoverSample,
}: TerrainProfilePanelProps) {
  const { t, i18n } = useTranslation("terrainProfile");
  const resolved = analysis?.status === "ready" || analysis?.status === "selection_required" ? analysis : null;
  const ready = analysis?.status === "ready" ? analysis : null;
  const failedAnalysis = analysis?.status === "failed" ? analysis : null;
  const candidates = resolved?.candidates ?? [];
  const selectedKey = antennaKey ?? ready?.selected_antenna_key;
  const selectableCandidates = useMemo(() => {
    if (resolved === null) return [];
    const all = resolved.candidates;
    if (receiver === null) return all;
    const filtered = filterTerrainProfileCandidatesByBearing(all, resolved.station, receiver);
    const selected = selectedKey === undefined ? undefined : all.find((candidate) => candidate.key === selectedKey);
    if (selected !== undefined && !filtered.some((candidate) => candidate.key === selected.key)) return [selected, ...filtered];
    return filtered;
  }, [resolved, selectedKey, receiver]);
  const antennaItems = useMemo(
    () =>
      [...selectableCandidates]
        .sort((a, b) => (a.band?.value ?? a.frequencyMHz) - (b.band?.value ?? b.frequencyMHz))
        .map((candidate) => ({
          value: candidate.key,
          label: candidateLabel(
            candidate,
            candidate.source !== "si2pem_report" || candidate.measuredTilt === null ? null : t("selection.tilt", { value: candidate.measuredTilt }),
          ),
        })),
    [selectableCandidates, t],
  );
  const selectedCandidate = candidates.find((candidate) => candidate.key === selectedKey);
  const stationLabel = resolved?.station.station_id ?? station?.stationId ?? t("station.selected");
  const operatorLabel = resolved?.station.operator?.name ?? station?.operatorName;
  const hasStation = station !== null || resolved !== null;
  const operatorMnc = resolveOperatorMnc(resolved?.station.operator?.mnc ?? null, operatorLabel ?? "");
  const operatorSwatchColor = resolveSwatchColor(hasStation, operatorMnc, operatorLabel);
  const isFailed = error !== null || failedAnalysis !== null;
  const isProcessing = station !== null && error === null && (isWorking || analysis?.status === "pending");
  const surfaceOnlyIssue =
    ready !== null &&
    ready.assessment.terrain_status === "clear" &&
    (ready.assessment.surface_status === "constrained" || ready.assessment.surface_status === "blocked");
  const outOfAzimuth = ready !== null && ready.assessment.warning_codes.includes("ANTENNA_AZIMUTH_MISMATCH");
  const verticalAlignment = ready?.assessment.vertical_alignment;
  const verticalOffsetDegrees = verticalAlignment?.vertical_offset_deg ?? null;
  const verticalOffsetLabel = verticalOffsetDegrees === null ? "-" : `${verticalOffsetDegrees > 0 ? "+" : ""}${verticalOffsetDegrees.toFixed(1)}°`;

  const formatReportDate = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(date);
  };

  return (
    <section className="flex max-h-[inherit] min-h-0 flex-col overflow-y-auto overscroll-contain rounded-lg border bg-background/95 text-foreground shadow-xl backdrop-blur-md animate-in fade-in duration-150 md:overflow-hidden">
      <div
        {...headerDragProps}
        className={cn(
          "sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:bg-transparent md:backdrop-blur-none",
          headerDragProps?.className,
        )}
      >
        <div
          className="relative flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-start md:gap-3 md:px-4 md:py-3"
          style={
            operatorSwatchColor
              ? { backgroundImage: `linear-gradient(115deg, ${operatorSwatchColor}24 0%, ${operatorSwatchColor}0f 34%, transparent 70%)` }
              : undefined
          }
        >
          <div className="flex-1 min-w-0 pr-8 md:pr-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {hasStation ? (
                <>
                  {operatorLabel !== undefined && <DialogOperatorName name={operatorLabel} mnc={operatorMnc} compact />}
                  <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{stationLabel}</span>
                </>
              ) : (
                <span className="text-sm font-semibold">{t("title")}</span>
              )}
            </div>
            {ready !== null && !outOfAzimuth ? (
              <div className="mt-1.5 flex min-w-0 items-start gap-1.5">
                <HugeiconsIcon
                  icon={VERDICT_ICON[ready.assessment.status]}
                  className={cn("mt-0.5 size-4 shrink-0", VERDICT_TEXT[ready.assessment.status])}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{t(`verdict.${ready.assessment.status}`)}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {t("verdict.summary", {
                        distance: (ready.path.distance_m / 1000).toFixed(2),
                        bearing: ready.path.bearing_deg.toFixed(1),
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t(`verdict.description.${ready.assessment.status}`)}</p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex w-full min-w-0 items-center gap-1 md:-mt-0.5 md:-mr-1 md:w-auto md:shrink-0">
            <ReceiverHeightField receiver={receiver} onCommit={onReceiverHeightChange} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={onUseCurrentLocation}
              disabled={isLocating}
              aria-busy={isLocating}
              aria-describedby={gpsError === null ? undefined : "terrain-profile-gps-error"}
            >
              {isLocating ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Location01Icon} className="size-3.5" />}
              <span className="hidden lg:inline">{isLocating ? t("receiver.locating") : t("receiver.useGps")}</span>
            </Button>
            {selectableCandidates.length > 1 ? (
              <Select
                value={selectedKey ?? ""}
                items={antennaItems}
                onValueChange={(value) => {
                  if (value === null) return;
                  onAntennaChange(value);
                }}
              >
                <SelectTrigger className="h-7 min-w-0 flex-1 text-xs md:w-44 md:flex-none" aria-label={t("selection.title")}>
                  <SelectValue placeholder={t("selection.placeholder")} />
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  {selectableCandidates.map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.key}>
                      {candidateLabel(
                        candidate,
                        candidate.source !== "si2pem_report" || candidate.measuredTilt === null
                          ? null
                          : t("selection.tilt", { value: candidate.measuredTilt }),
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common:actions.close")}
              className="absolute top-2.5 right-3 flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted md:static"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 overflow-visible px-3 py-3 custom-scrollbar scrollbar-gutter-stable md:min-h-0 md:flex-1 md:overflow-y-auto">
        {gpsError !== null ? (
          <div id="terrain-profile-gps-error" role="alert" className="mb-2 flex items-start gap-1.5 text-xs leading-snug text-destructive">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-px size-3.5 shrink-0" />
            <span>{t(`receiver.gpsErrors.${gpsError}`)}</span>
          </div>
        ) : null}

        {isLocating ? (
          <span role="status" aria-live="polite" className="sr-only">
            {t("receiver.locating")}
          </span>
        ) : null}

        {station === null ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">{t("empty.stationTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("empty.stationDescription")}</p>
          </div>
        ) : null}

        {isFailed ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-destructive">{t("states.failed")}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {failedAnalysis?.errors[0]?.message ?? error?.message ?? t("states.failedDescription")}
              </p>
            </div>
            <Button type="button" variant="outline" size="icon-sm" onClick={onRetry} aria-label={t("actions.retry")}>
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {analysis?.status === "selection_required" && !isFailed ? (
          <p className="text-xs leading-snug text-muted-foreground">{t("selection.required")}</p>
        ) : null}

        {isProcessing ? (
          <div role="status" aria-live="polite" className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5 shrink-0" />
              {t("states.processing")}
            </div>
            <Skeleton className="h-56 w-full" />
          </div>
        ) : null}

        {ready !== null && outOfAzimuth ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("states.outOfAzimuth")}</p> : null}

        {ready !== null && !outOfAzimuth ? (
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <TerrainProfileChart
              samples={samplesFromArrays(ready.path.samples)}
              bullingtonDistanceKm={ready.propagation.bullington_distance_km}
              totalPathDistanceM={ready.path.distance_m}
              onHoverSample={onHoverSample}
            />
          </Suspense>
        ) : null}
      </div>

      {(receiver !== null && ready === null) || (ready !== null && !outOfAzimuth) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {ready !== null ? (
            <>
              <InlineMetric
                label={t("metrics.pathLoss")}
                value={`${ready.propagation.basic_transmission_loss_db.toFixed(1)} dB`}
                description={t("metrics.pathLossDescription")}
              />
              <InlineMetric
                label={t("metrics.fieldStrength")}
                value={`${ready.propagation.field_strength_dbuvm.toFixed(1)} dBuV/m`}
                description={t("metrics.fieldStrengthDescription")}
              />
              <InlineMetric
                label={t("metrics.antennaHeight")}
                value={selectedCandidate === undefined ? "-" : `${selectedCandidate.antenna.mountedHeight.toFixed(1)} m`}
              />
              {verticalAlignment !== undefined ? (
                <InlineMetric
                  label={t("metrics.beamOffset")}
                  value={verticalOffsetLabel}
                  description={
                    verticalAlignment.basis === "si2pem_measured_resultant_tilt"
                      ? t("metrics.beamOffsetDescription")
                      : t("metrics.beamOffsetUnavailableDescription")
                  }
                />
              ) : null}
              <span className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">ITU-R P.1812-8</span>
                <span title={ready.terrain.terrain_model.dataset}>{t("evidence.lidar", { source: "LiDAR GUGiK" })}</span>
                {ready.report !== null ? (
                  <a href={ready.report.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {t("evidence.si2pem", {
                      date: ready.report.published_at === null ? t("evidence.latest") : formatReportDate(ready.report.published_at),
                    })}
                    <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
                  </a>
                ) : (
                  <span>{t("evidence.noReport")}</span>
                )}
              </span>
            </>
          ) : (
            <span>{t("receiver.hint")}</span>
          )}

          {surfaceOnlyIssue && !outOfAzimuth ? (
            <span className="flex w-full items-start gap-1.5 text-xs">
              <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              {t("verdict.surfaceOnly")}
            </span>
          ) : null}

          {ready !== null
            ? ready.assessment.warning_codes.flatMap((code) => {
                if (code === "ANTENNA_AZIMUTH_MISMATCH") return [];
                const hasUkeFallback = ready.assessment.warning_codes.includes("UKE_ANTENNA_FALLBACK");
                if (hasUkeFallback && (code === "SI2PEM_REPORT_UNAVAILABLE" || code === "SI2PEM_REPORT_PARSE_FAILED")) return [];
                return (
                  <span key={code} className="flex w-full items-start gap-1.5 text-xs">
                    <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    {t(`warnings.codes.${code}`, { defaultValue: code })}
                  </span>
                );
              })
            : null}
        </div>
      ) : null}
    </section>
  );
}
