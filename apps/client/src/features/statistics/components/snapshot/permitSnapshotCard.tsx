import { AirportTowerIcon, Download04Icon, FileAttachmentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PermitSnapshot, SnapshotBand } from "../../lib/chartData";
import { currentMonth } from "../../lib/periods";
import { permitSnapshotQueryOptions } from "../../queries";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { BLOCK_DESCRIPTION_CLASS, CARD_BLOCK_CLASS, StatisticsCard } from "../card/statisticsCard";
import { IconToggleGroup } from "../controls/iconToggleGroup";
import { MonthPickerButton } from "../controls/monthPicker";
import { PermitSnapshotBandChart, type SnapshotMetric } from "./permitSnapshotBandChart";
import { PermitSnapshotImage, exportPermitSnapshotImage } from "./permitSnapshotImage";
import { getBandCellStyle } from "./snapshotLayout";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatShortUtcDate } from "@/lib/format";

type PermitSnapshotCardProps = { countryCode: string; title: string; sourceName: string | null };

type SnapshotGridProps = {
  bands: SnapshotBand[];
  isLoading: boolean;
  metric: SnapshotMetric;
  isError: boolean;
  onRetry: () => unknown;
  isRetrying: boolean;
};

const NO_BANDS: SnapshotBand[] = [];
const REGISTER_FILE_NAME = "register";
const SKELETON_BAND_COUNT = 6;
const SKELETON_OPERATOR_COUNT = 4;

const SNAPSHOT_METRICS: readonly { value: SnapshotMetric; icon: IconSvgElement }[] = [
  { value: "stations", icon: AirportTowerIcon },
  { value: "permits", icon: FileAttachmentIcon },
];

function SnapshotLegend() {
  const { t } = useTranslation("common");

  return (
    <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      <li className="inline-flex h-5 items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-[2px] bg-muted-foreground" />
        {t("status.all")}
      </li>
      <li className="inline-flex h-5 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[2px] border border-muted-foreground bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_5px)]"
        />
        {t("labels.new")}
      </li>
    </ul>
  );
}

function BandFlow({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden border-t">
      <div className="-mr-px -mb-px flex flex-wrap *:min-w-0 *:border-r *:border-b">{children}</div>
    </div>
  );
}

function SnapshotComparisonGrid({ bands, isLoading, metric, isError, onRetry, isRetrying }: SnapshotGridProps) {
  const { t } = useTranslation("statistics");

  if (isLoading) {
    return (
      <BandFlow>
        {Array.from({ length: SKELETON_BAND_COUNT }, (_, index) => (
          <div key={index} aria-hidden="true" className="p-4" style={getBandCellStyle(SKELETON_OPERATOR_COUNT, "page")}>
            <Skeleton className="mb-3 h-4 w-20" />
            <Skeleton className="h-56 bg-muted/40" />
          </div>
        ))}
      </BandFlow>
    );
  }

  if (isError) {
    return (
      <div className={CARD_BLOCK_CLASS}>
        <ErrorState onRetry={onRetry} isRetrying={isRetrying} />
      </div>
    );
  }

  if (bands.length === 0) {
    return <div className="flex h-56 items-center justify-center border-t text-sm text-muted-foreground">{t("common:empty.data")}</div>;
  }

  return (
    <BandFlow>
      {bands.map((band) => (
        <div key={band.key} style={getBandCellStyle(band.rows.length, "page")}>
          <PermitSnapshotBandChart band={band} metric={metric} />
        </div>
      ))}
    </BandFlow>
  );
}

function useSnapshotDates(snapshot: PermitSnapshot | undefined): string | null {
  const { t, i18n } = useTranslation("statistics");
  if (snapshot === undefined || snapshot.snapshotOn === null) return null;

  const date = formatShortUtcDate(snapshot.snapshotOn, i18n.language);
  if (snapshot.previousSnapshotOn === null) return t("register.dataFrom", { date });
  return t("permitsByMonth.snapshotDate", { date, previousDate: formatShortUtcDate(snapshot.previousSnapshotOn, i18n.language) });
}

function waitForExportLayout(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function PermitSnapshotCard({ countryCode, title, sourceName }: PermitSnapshotCardProps) {
  const { t } = useTranslation("statistics");
  const [month, setMonth] = useState(currentMonth);
  const [metric, setMetric] = useState<SnapshotMetric>("stations");
  const [isExporting, setIsExporting] = useState(false);
  const exportImageRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(permitSnapshotQueryOptions(countryCode, month));
  const snapshotDates = useSnapshotDates(data);
  const bands = data?.bands ?? NO_BANDS;

  const monthPrompt = sourceName === null ? t("permitsByMonth.registerDescription") : t("permitsByMonth.description", { source: sourceName });
  const description = snapshotDates === null ? monthPrompt : t("permitsByMonth.summary", { dates: snapshotDates });
  const imageDescription = snapshotDates ?? monthPrompt;
  const metricOptions = SNAPSHOT_METRICS.map((option) => ({ ...option, label: t(`permitsByMonth.views.${option.value}`) }));

  async function handleExport() {
    setIsExporting(true);
    try {
      await waitForExportLayout();
      const exportNode = exportImageRef.current;
      if (exportNode === null) throw new Error("The statistics export layout did not mount");
      await exportPermitSnapshotImage(exportNode, `btsearch-${sourceName?.toLowerCase() ?? REGISTER_FILE_NAME}-${month}-${metric}.png`);
    } catch {
      toast.error(t("permitsByMonth.export.error"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <StatisticsCard
      id={STATISTICS_SECTION_IDS.snapshot}
      title={title}
      description={
        <>
          <p className={BLOCK_DESCRIPTION_CLASS}>{description}</p>
          <SnapshotLegend />
        </>
      }
      actions={
        <>
          <IconToggleGroup label={t("filters.view")} options={metricOptions} value={metric} onValueChange={setMetric} />
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
        </>
      }
    >
      <SnapshotComparisonGrid
        bands={bands}
        isLoading={isLoading}
        metric={metric}
        isError={isLoadingError}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
      {isExporting ? (
        <PermitSnapshotImage
          ref={exportImageRef}
          bands={bands}
          description={imageDescription}
          metric={metric}
          month={month}
          sourceName={sourceName}
        />
      ) : null}
    </StatisticsCard>
  );
}
