import { ArrowUpRight01Icon, Radar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { EmfRegisterUnavailableError } from "../api";
import type { EmfReport } from "../types";
import { useAntennaFormat } from "./antennaFormat";
import {
  BODY_COLUMNS_CLASS,
  BODY_STACK_CLASS,
  GROUP_BOX_CLASS,
  LIST_COLUMN_CLASS,
  LIST_STACK_CLASS,
  OVERVIEW_CLASS,
  OVERVIEW_DETAIL_CLASS,
  OVERVIEW_PHONE_CLASS,
} from "./antennaLayout";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { RateLimitError } from "@/lib/api";
import { cn } from "@/lib/utils";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

type OpenReportButtonProps = {
  reportUrl: string;
  variant: "outline" | "ghost";
};

type AntennaLoadingProps = {
  isPhone: boolean;
};

type AntennaEmptyProps = {
  reportUrl: string;
  alternativeReport: EmfReport | null;
  onShowReport: (reportUrl: string) => void;
};

type AntennaFailureProps = {
  error: unknown;
  reportUrl: string;
  onRetry: () => unknown;
};

type AntennaComparisonNoticeProps = {
  error: unknown;
  onRetry?: () => unknown;
};

function OpenReportButton({ reportUrl, variant }: OpenReportButtonProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <Button
      variant={variant}
      size="sm"
      nativeButton={false}
      render={<a href={reportUrl} target="_blank" rel="noreferrer" />}
      className="cursor-pointer"
    >
      {t("si2pemAntennaData.openReport")}
      <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" className="size-4" aria-hidden="true" />
    </Button>
  );
}

export function AntennaLoading({ isPhone }: AntennaLoadingProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <div className={isPhone ? BODY_STACK_CLASS : BODY_COLUMNS_CLASS}>
      <div aria-hidden="true" className={isPhone ? OVERVIEW_PHONE_CLASS : OVERVIEW_CLASS}>
        <div className="flex size-52 shrink-0 items-center justify-center">
          <Skeleton className="size-[116px] rounded-full" />
        </div>
        <div className={cn("flex flex-col gap-2", isPhone ? "self-stretch" : OVERVIEW_DETAIL_CLASS)}>
          <Skeleton className="h-3 w-[150px]" />
          {isPhone ? null : <Skeleton className="h-3 w-[110px]" />}
        </div>
      </div>
      <div className={isPhone ? LIST_STACK_CLASS : LIST_COLUMN_CLASS}>
        <p role="status" className={cn("flex items-start gap-2 py-2.5 text-[12.5px] leading-[18px]", isPhone ? "px-2.5" : "px-3.5")}>
          <LoadingIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            <span className="font-semibold">{t("si2pemAntennaData.loading.title")}</span>{" "}
            <span className="text-muted-foreground">{t("si2pemAntennaData.loading.hint")}</span>
          </span>
        </p>
        <div aria-hidden="true" className={cn(GROUP_BOX_CLASS, isPhone ? "mx-2 mb-2" : "mx-3 mb-3")}>
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-start gap-3 border-t border-border/60 px-3 py-[9px] first:border-t-0">
              <Skeleton className="h-4 w-10 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-[120px] max-w-full" />
                <Skeleton className="h-2.5 w-[70px]" />
              </div>
              {isPhone ? null : <Skeleton className="h-4 w-[300px] min-w-0 shrink" />}
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AntennaEmpty({ reportUrl, alternativeReport, onShowReport }: AntennaEmptyProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();

  return (
    <ErrorState
      tone="neutral"
      icon={Radar01Icon}
      className="flex-1"
      title={t("si2pemAntennaData.emptyTitle")}
      description={t("si2pemAntennaData.emptyDescription")}
      action={
        <>
          <OpenReportButton reportUrl={reportUrl} variant="outline" />
          {alternativeReport === null ? null : (
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => onShowReport(alternativeReport.url)}>
              {t("si2pemAntennaData.showReportFrom", { date: format.longDate(alternativeReport.measuredOn) })}
            </Button>
          )}
        </>
      }
    />
  );
}

export function AntennaFailure({ error, reportUrl, onRetry }: AntennaFailureProps) {
  const { t } = useTranslation("stationDetails");
  let title = t("si2pemAntennaData.errorTitle");
  let description = t("si2pemAntennaData.errorDescription");
  if (error instanceof RateLimitError) {
    title = t("si2pemAntennaData.failure.limitTitle");
    description = t("si2pemAntennaData.failure.limitDescription");
  } else if (error instanceof EmfRegisterUnavailableError) {
    title = t("si2pemAntennaData.failure.unavailableTitle");
    description = t("si2pemAntennaData.failure.unavailableDescription");
  }

  return (
    <ErrorState
      className="flex-1"
      title={title}
      description={description}
      onRetry={onRetry}
      action={<OpenReportButton reportUrl={reportUrl} variant="ghost" />}
    />
  );
}

export function AntennaComparisonNotice({ error, onRetry }: AntennaComparisonNoticeProps) {
  const { t } = useTranslation("stationDetails");
  const title = error instanceof RateLimitError ? t("si2pemAntennaData.failure.limitDescription") : t("si2pemAntennaData.comparison.failed");

  return <InlineError size="sm" className="mx-3 mt-1" title={title} onRetry={onRetry} />;
}
