import { AirportTowerIcon, Calendar03Icon, Download04Icon, FileAttachmentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { permitSnapshotQueryOptions } from "../queries";
import { PermitSnapshotBandChart, type SnapshotBand, type SnapshotMetric, buildSnapshotBands } from "./permitSnapshotBandChart";
import { PermitSnapshotImage, exportPermitSnapshotImage } from "./permitSnapshotImage";

const SNAPSHOT_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] divide-x divide-y divide-border border-t border-border";

const SNAPSHOT_METRICS: { key: SnapshotMetric; icon: typeof FileAttachmentIcon }[] = [
  { key: "stations", icon: AirportTowerIcon },
  { key: "permits", icon: FileAttachmentIcon },
];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthValueToDate(value: string): Date {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function dateToMonthValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function MonthPickerButton({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t, i18n } = useTranslation("statistics");
  const date = monthValueToDate(value);
  const label = date.toLocaleDateString(i18n.language, { month: "long", timeZone: "UTC", year: "numeric" });

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "h-8 rounded-lg border bg-transparent px-2.5 text-sm transition-colors flex items-center gap-2 min-w-36",
          "border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted",
        )}
        aria-label={t("permitsByMonth.month")}
      >
        <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 text-muted-foreground shrink-0" />
        <span className="truncate capitalize">{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <DatePickerInput value={date} onChange={(nextDate) => onValueChange(nextDate !== null ? dateToMonthValue(nextDate) : currentMonth())} />
      </PopoverContent>
    </Popover>
  );
}

function SnapshotMetricToggle({ value, onValueChange }: { value: SnapshotMetric; onValueChange: (metric: SnapshotMetric) => void }) {
  const { t } = useTranslation("statistics");
  return (
    <ButtonGroup aria-label={t("permitsByMonth.view")}>
      {SNAPSHOT_METRICS.map(({ key, icon }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={value === key ? "default" : "outline"}
          aria-pressed={value === key}
          aria-label={t(`permitsByMonth.views.${key}`)}
          title={t(`permitsByMonth.views.${key}`)}
          onClick={() => onValueChange(key)}
        >
          <HugeiconsIcon icon={icon} className="size-4" />
          <span className="hidden text-xs sm:inline">{t(`permitsByMonth.views.${key}`)}</span>
        </Button>
      ))}
    </ButtonGroup>
  );
}

function SnapshotComparisonGrid({ bands, isLoading, metric }: { bands: SnapshotBand[]; isLoading: boolean; metric: SnapshotMetric }) {
  const { t } = useTranslation("statistics");

  if (isLoading) {
    return (
      <div className={SNAPSHOT_GRID_CLASS}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="p-4">
            <div className="mb-3 h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-56 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
    );
  }

  if (bands.length === 0) {
    return <div className="flex h-56 items-center justify-center border-t border-border text-muted-foreground text-sm">{t("charts.noData")}</div>;
  }

  return (
    <div className={SNAPSHOT_GRID_CLASS}>
      {bands.map((band) => (
        <PermitSnapshotBandChart key={band.id} band={band} metric={metric} />
      ))}
    </div>
  );
}

function waitForExportLayout(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function PermitsByMonthChart() {
  const { t } = useTranslation("statistics");
  const [month, setMonth] = useState(currentMonth);
  const [metric, setMetric] = useState<SnapshotMetric>("stations");
  const [isExporting, setIsExporting] = useState(false);
  const exportImageRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery(permitSnapshotQueryOptions(month));
  const bands = useMemo(() => buildSnapshotBands(data?.rows), [data?.rows]);

  const description = data?.snapshot_date
    ? t("permitsByMonth.snapshotDate", {
        date: data.snapshot_date.slice(0, 10),
        previousDate: data.previous_snapshot_date?.slice(0, 10) ?? t("permitsByMonth.noPreviousSnapshot"),
      })
    : t("permitsByMonth.description");

  async function handleExport() {
    if (isExporting || isLoading || bands.length === 0) return;

    setIsExporting(true);
    try {
      await waitForExportLayout();
      const exportNode = exportImageRef.current;
      if (exportNode === null) throw new Error("The statistics export layout did not mount");
      await exportPermitSnapshotImage(exportNode, `btsearch-uke-${month}-${metric}.png`);
    } catch {
      toast.error(t("permitsByMonth.export.error"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="relative border border-border">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-medium leading-none">{t("permitsByMonth.title")}</h3>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SnapshotMetricToggle value={metric} onValueChange={setMetric} />
          <MonthPickerButton value={month} onValueChange={setMonth} />
          <Separator orientation="vertical" className="mx-0.5 shrink-0 data-[orientation=vertical]:h-5" style={{ alignSelf: "center" }} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoading || bands.length === 0 || isExporting}
            onClick={() => void handleExport()}
          >
            {isExporting ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} className="size-4" data-icon="inline-start" />}
            {t(isExporting ? "permitsByMonth.export.generating" : "permitsByMonth.export.button")}
          </Button>
        </div>
      </div>
      <SnapshotComparisonGrid bands={bands} isLoading={isLoading} metric={metric} />
      {isExporting ? <PermitSnapshotImage ref={exportImageRef} bands={bands} description={description} metric={metric} month={month} /> : null}
    </div>
  );
}
