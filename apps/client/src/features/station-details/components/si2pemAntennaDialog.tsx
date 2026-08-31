import { Alert02Icon, ArrowUpRight01Icon, Cancel01Icon, Radar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import { fetchSI2PEMAntennas } from "../api";
import type { PemReport, SI2PEMAntenna } from "../api";
import { DialogOperatorName } from "./dialogOperatorName";
import type { FloatingDialogPanelFrameProps } from "./floatingDialogStackTypes";
import { SI2PEMLogo } from "./si2pemLogo";

type SI2PEMAntennaDialogPanelProps = FloatingDialogPanelFrameProps & {
  report: PemReport;
  latitude: number;
  longitude: number;
  operatorName: string;
  operatorMnc?: number | null;
};

type SI2PEMAntennaGroup = {
  key: string;
  antenna: SI2PEMAntenna["antenna"];
  eirp: number | null;
  bands: SI2PEMAntenna[];
};

function groupSI2PEMAntennas(antennas: SI2PEMAntenna[]): SI2PEMAntennaGroup[] {
  const groups: SI2PEMAntennaGroup[] = [];

  for (const [index, item] of antennas.entries()) {
    const currentGroup = groups.at(-1);
    if (item.bandIndex === 0 || currentGroup === undefined) {
      groups.push({
        key: `${item.pageNumber}:${item.rowNumber ?? "prose"}:${index}`,
        antenna: item.antenna,
        eirp: item.eirp,
        bands: [item],
      });
      continue;
    }

    currentGroup.bands.push(item);
  }

  return groups;
}

function SI2PEMAntennaList({ groups }: { groups: SI2PEMAntennaGroup[] }) {
  const { t, i18n } = useTranslation("stationDetails");
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }), [i18n.language]);

  function formatNumber(value: number | null, unit = ""): string {
    return value === null ? "-" : `${numberFormatter.format(value)}${unit}`;
  }

  function formatTiltRange(range: SI2PEMAntenna["tiltRange"]): string {
    return range === null ? "-" : `${numberFormatter.format(range.minimum)}-${numberFormatter.format(range.maximum)}°`;
  }

  return (
    <div className="divide-y divide-border/60">
      {groups.map((group, antennaIndex) => {
        const summary = [
          [t("si2pemAntennaData.fields.azimuth"), formatNumber(group.antenna.azimuth, "°")],
          [t("si2pemAntennaData.fields.height"), formatNumber(group.antenna.mountedHeight, " m")],
          [t("si2pemAntennaData.fields.eirp"), formatNumber(group.eirp, " W")],
        ];

        return (
          <section key={group.key} className="py-2.5 first:pt-1 last:pb-1" aria-labelledby={`${group.key}-title`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary" aria-hidden="true" className="h-5 min-w-6 justify-center px-1 py-0 text-[10px] font-semibold tabular-nums">
                {antennaIndex + 1}
              </Badge>
              <h3 id={`${group.key}-title`} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                <span className="sr-only">{t("si2pemAntennaData.antennaNumber", { number: antennaIndex + 1 })} · </span>
                {group.antenna.model ?? t("si2pemAntennaData.unknownModel")}
                {group.antenna.manufacturer ? <span className="font-normal text-muted-foreground"> · {group.antenna.manufacturer}</span> : null}
              </h3>
              <p className="w-full text-xs text-muted-foreground tabular-nums sm:ml-auto sm:w-auto">
                {summary.map(([label, value], index) => (
                  <span key={label}>
                    {index > 0 ? <span className="mx-1.5 text-muted-foreground/50">·</span> : null}
                    {label} <span className="font-medium text-foreground">{value}</span>
                  </span>
                ))}
              </p>
            </div>
            <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-2.5 py-1.5 text-sm tabular-nums">
              {group.bands.map((band) => (
                <Fragment key={band.bandIndex}>
                  <span className="truncate font-mono font-medium text-foreground">{`${numberFormatter.format(band.frequencyMHz)} MHz`}</span>
                  <span className="text-right">
                    <span className="text-xs text-muted-foreground">{t("si2pemAntennaData.fields.tiltRange")} </span>
                    <span className="font-medium">{formatTiltRange(band.tiltRange)}</span>
                  </span>
                  <span className="text-right">
                    <span className="text-xs text-muted-foreground">{t("si2pemAntennaData.fields.measuredTilt")} </span>
                    <span className="font-medium">{formatNumber(band.measuredTilt, "°")}</span>
                  </span>
                </Fragment>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type SI2PEMAntennaErrorProps = {
  isRetrying: boolean;
  onRetry: () => void;
};

function SI2PEMAntennaError({ isRetrying, onRetry }: SI2PEMAntennaErrorProps) {
  const { t } = useTranslation(["stationDetails", "common"]);

  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
      <HugeiconsIcon icon={Alert02Icon} className="size-7 text-destructive" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{t("si2pemAntennaData.errorTitle")}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{t("si2pemAntennaData.errorDescription")}</p>
      <Button variant="outline" size="sm" className="mt-4" disabled={isRetrying} onClick={onRetry}>
        {isRetrying ? t("common:actions.loading") : t("common:actions.retry")}
      </Button>
    </div>
  );
}

function SI2PEMAntennaEmpty() {
  const { t } = useTranslation("stationDetails");

  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <HugeiconsIcon icon={Radar01Icon} className="size-7 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{t("si2pemAntennaData.emptyTitle")}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{t("si2pemAntennaData.emptyDescription")}</p>
    </div>
  );
}

function SI2PEMAntennaLoading() {
  return (
    <div className="divide-y divide-border/60" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="py-2.5 first:pt-1 last:pb-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-6 rounded-md" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="ml-auto hidden h-3 w-48 sm:block" />
          </div>
          <Skeleton className="mt-1.5 h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function SI2PEMAntennaDialogPanel({
  report,
  latitude,
  longitude,
  operatorName,
  operatorMnc,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: SI2PEMAntennaDialogPanelProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const titleId = useId();
  const headerDragClassName = headerDragProps?.className;
  const operatorColor = operatorMnc ? getOperatorColor(operatorMnc) : "#3b82f6";
  const reportDate = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(new Date(report.date)),
    [i18n.language, report.date],
  );
  const {
    data: antennas,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["si2pem-report-antennas", report.station_id, report.details.document_url, latitude, longitude],
    queryFn: () => fetchSI2PEMAntennas({ stationId: report.station_id, latitude, longitude, reportUrl: report.details.document_url }),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  });
  const antennaGroups = useMemo(() => groupSI2PEMAntennas(antennas ?? []), [antennas]);

  return (
    <div className={cn("relative", className)} style={style} role="dialog" aria-labelledby={titleId}>
      <div
        ref={contentRef}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 border-b bg-background/95 backdrop-blur-sm", headerDragClassName)}>
          <div
            className="flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
            style={{ backgroundImage: `linear-gradient(115deg, ${operatorColor}24 0%, ${operatorColor}0f 34%, transparent 70%)` }}
          >
            <div id={titleId} className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <SI2PEMLogo className="h-3.5 shrink-0" />
                <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">{t("si2pemAntennaData.title")}</h2>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <DialogOperatorName name={operatorName} mnc={operatorMnc} compact />
                <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{report.station_id}</span>
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {reportDate}
                  <span className="mx-1.5 text-muted-foreground/50">·</span>
                  {report.details.lab_name}
                </p>
              </div>
            </div>
            <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">
              <a
                href={report.details.document_url}
                target="_blank"
                rel="noreferrer"
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="hidden sm:inline">{t("si2pemAntennaData.openReport")}</span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
              </a>
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={t("common:actions.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
          <div ref={bodyContentRef} className="px-3 py-2 sm:px-4 sm:py-2.5">
            {isLoading ? <SI2PEMAntennaLoading /> : null}
            {error ? <SI2PEMAntennaError isRetrying={isFetching} onRetry={() => void refetch()} /> : null}
            {!error && antennas?.length === 0 ? <SI2PEMAntennaEmpty /> : null}
            {antennaGroups.length > 0 ? <SI2PEMAntennaList groups={antennaGroups} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
