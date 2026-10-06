import { ArrowDown01Icon, ArrowUpRight01Icon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { getEmfReportDate, getEmfReportIssuer } from "../reports";
import type { EmfReport } from "../types";
import { useAntennaFormat } from "./antennaFormat";
import type { AntennaReportChoice } from "./useAntennaReportChoice";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NEWEST_REPORT_INDEX = 0;

type AntennaReportBarProps = {
  reportChoice: AntennaReportChoice;
  onShowReport: (reportUrl: string) => void;
  isComparisonPressed: boolean;
  isComparisonBusy: boolean;
  isComparisonDisabled: boolean;
  onToggleComparison: () => void;
  isPhone: boolean;
};

type ReportPickerProps = {
  reports: readonly EmfReport[];
  shownReport: EmfReport;
  shownIndex: number | null;
  onShowReport: (reportUrl: string) => void;
};

type OpenReportLinkProps = {
  reportUrl: string;
  isIconOnly: boolean;
};

export function AntennaReportBar({
  reportChoice,
  onShowReport,
  isComparisonPressed,
  isComparisonBusy,
  isComparisonDisabled,
  onToggleComparison,
  isPhone,
}: AntennaReportBarProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const { shownReport, listedReports, shownIndex, olderReport } = reportChoice;

  const comparisonToggle =
    olderReport === null ? null : (
      <Button
        type="button"
        variant={isComparisonPressed ? "default" : "outline"}
        size="sm"
        aria-pressed={isComparisonPressed}
        aria-busy={isComparisonBusy || undefined}
        disabled={isComparisonDisabled}
        focusableWhenDisabled
        className="cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50"
        onClick={onToggleComparison}
      >
        {isComparisonBusy ? (
          <LoadingIcon data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={WorkHistoryIcon} data-icon="inline-start" aria-hidden="true" />
        )}
        {t("si2pemAntennaData.changesSince", { date: format.shortDate(olderReport.measuredOn) })}
      </Button>
    );
  const openReportLink = <OpenReportLink reportUrl={shownReport.url} isIconOnly={isPhone} />;

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 py-1.5 pr-1.5 pl-4 sm:pl-6">
      <ReportPicker reports={listedReports} shownReport={shownReport} shownIndex={shownIndex} onShowReport={onShowReport} />
      {shownIndex === NEWEST_REPORT_INDEX ? <LatestMark /> : null}
      <span className="min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground">{isPhone ? null : getEmfReportIssuer(shownReport)}</span>
      {isPhone ? openReportLink : comparisonToggle}
      {isPhone ? comparisonToggle : openReportLink}
    </div>
  );
}

function LatestMark() {
  const { t } = useTranslation("common");

  return <span className="shrink-0 text-[10px] font-semibold uppercase leading-4 text-emerald-700 dark:text-emerald-400">{t("labels.latest")}</span>;
}

function ReportPicker({ reports, shownReport, shownIndex, onShowReport }: ReportPickerProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const shownDate = format.longDate(getEmfReportDate(shownReport));

  if (shownIndex === null || reports.length < 2) {
    return (
      <p className="shrink-0 text-[13px] font-medium leading-5 tabular-nums">
        <span className="sr-only">{t("si2pemAntennaData.report")}: </span>
        {shownDate}
      </p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="cursor-pointer gap-1.5 text-[13px]" />}>
        <span className="sr-only">{t("si2pemAntennaData.report")}: </span>
        <span className="tabular-nums">{shownDate}</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {t("si2pemAntennaData.reportPosition", { position: shownIndex + 1, total: reports.length })}
        </span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" positionerClassName="z-[9999]" className="max-h-80 w-auto min-w-64 max-w-96 overflow-y-auto">
        <DropdownMenuRadioGroup value={shownReport.url} onValueChange={(reportUrl: string) => onShowReport(reportUrl)}>
          {reports.map((listed, index) => (
            <DropdownMenuRadioItem key={listed.url} value={listed.url} closeOnClick className="cursor-pointer">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-sm font-medium">{format.longDate(getEmfReportDate(listed))}</span>
                  {index === NEWEST_REPORT_INDEX ? <LatestMark /> : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{getEmfReportIssuer(listed)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OpenReportLink({ reportUrl, isIconOnly }: OpenReportLinkProps) {
  const { t } = useTranslation("stationDetails");
  const label = t("si2pemAntennaData.openReport");

  if (isIconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className={buttonVariants({ variant: "ghost", size: "icon", className: "cursor-pointer text-muted-foreground" })}
            />
          }
        >
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      nativeButton={false}
      render={<a href={reportUrl} target="_blank" rel="noreferrer" />}
      className="cursor-pointer text-xs text-muted-foreground"
    >
      {label}
      <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" className="size-4" aria-hidden="true" />
    </Button>
  );
}
