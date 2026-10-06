import { ArrowRight01Icon, ArrowUpRight01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { emfReportsQueryOptions } from "../station/emf/api";
import { getEmfReportDate, getEmfReportIssuer, toEmfReportDate } from "../station/emf/reports";
import type { EmfReport, EmfSite, EmfSitePlace } from "../station/emf/types";
import { SI2PEMLogo } from "./si2pemLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";

type ReportItem = {
  report: EmfReport;
  dateLabel: string;
  isLatest: boolean;
  sourceLabel: "pemSourceGenerated" | "pemSourceSearch";
};

type SI2PEMReportsMenuProps = {
  site: EmfSite;
  siteId: string;
  operatorName: string;
  operatorMnc?: number | null;
  place?: EmfSitePlace;
};

type ReportItemContentProps = {
  dateLabel: string;
  tag: string;
  issuer: string;
  children?: ReactNode;
};

function groupReportsByYear(reports: readonly EmfReport[], language: string): [string, ReportItem[]][] {
  const formatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "long" });
  const dated = reports.flatMap((report) => {
    const date = getEmfReportDate(report);
    return date === null ? [] : [{ report, date }];
  });
  dated.sort((a, b) => b.date.localeCompare(a.date));
  const latest = dated.find((entry) => entry.report.kind === "measurement") ?? dated[0];
  const groups = new Map<string, ReportItem[]>();
  for (const entry of dated) {
    const year = entry.date.slice(0, 4);
    const item: ReportItem = {
      report: entry.report,
      dateLabel: formatter.format(toEmfReportDate(entry.date)),
      isLatest: entry === latest,
      sourceLabel: entry.report.kind === "measurement" ? "pemSourceGenerated" : "pemSourceSearch",
    };
    const group = groups.get(year);
    if (group) group.push(item);
    else groups.set(year, [item]);
  }
  return [...groups.entries()];
}

function ReportItemContent({ dateLabel, tag, issuer, children }: ReportItemContentProps) {
  return (
    <div className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="whitespace-nowrap text-sm font-medium">{dateLabel}</span>
        <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">{tag}</span>
        {children}
      </span>
      <span className="block truncate text-[11px] text-muted-foreground">{issuer}</span>
    </div>
  );
}

const STATUS_ITEM_CLASS_NAME = "text-muted-foreground data-disabled:opacity-100";

type ReportsMenuStatusProps = {
  reports: EmfReport[] | undefined;
  isPending: boolean;
  onRetry: () => void;
};

function ReportsMenuStatus({ reports, isPending, onRetry }: ReportsMenuStatusProps) {
  const { t } = useTranslation(["stationDetails", "common"]);

  if (isPending) {
    return (
      <DropdownMenuItem disabled className={STATUS_ITEM_CLASS_NAME}>
        {t("common:actions.loading")}
      </DropdownMenuItem>
    );
  }
  if (reports === undefined) {
    return (
      <DropdownMenuItem onClick={() => onRetry()}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("common:actions.retry")}</span>
          <span className="block text-[11px] text-muted-foreground">{t("specs.pemReportsError")}</span>
        </span>
        <HugeiconsIcon icon={RefreshIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuItem>
    );
  }
  if (reports.length === 0) {
    return (
      <DropdownMenuItem disabled className={STATUS_ITEM_CLASS_NAME}>
        {t("specs.pemReportsEmpty")}
      </DropdownMenuItem>
    );
  }
  return null;
}

export function SI2PEMReportsMenu({ site, siteId, operatorName, operatorMnc, place }: SI2PEMReportsMenuProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { openSI2PEMReportDialog } = useFloatingDialogStack();
  const { data: reports, isPending, refetch } = useQuery(emfReportsQueryOptions(site));
  const reportsByYear = reports === undefined ? [] : groupReportsByYear(reports, i18n.language);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-busy={isPending || undefined}
              className="inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 hover:bg-muted rounded transition-colors cursor-pointer"
            />
          }
        >
          <SI2PEMLogo className="h-3.5" label="SI2PEM" />
          {isPending ? (
            <span className="h-3 w-2 animate-pulse rounded-sm bg-muted" />
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">{reports?.length ?? "-"}</span>
          )}
        </TooltipTrigger>
        <TooltipContent>{t("specs.si2pemLink")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" sideOffset={4} positionerClassName="z-[9999]" className="w-auto max-w-96 max-h-80 overflow-y-auto">
        <ReportsMenuStatus reports={reports} isPending={isPending} onRetry={refetch} />
        {reportsByYear.map(([year, items]) => (
          <DropdownMenuGroup key={year}>
            <DropdownMenuLabel className="py-1 text-xs font-medium text-muted-foreground">{year}</DropdownMenuLabel>
            {items.map(({ report, dateLabel, isLatest, sourceLabel }) => {
              const showAntennaData = report.kind === "measurement" && report.hasAntennaTable;
              const installationDocument = report.installationDocumentUrl;
              const issuer = getEmfReportIssuer(report) ?? "";
              const openAntennaDialog = () => {
                openSI2PEMReportDialog({ site, siteId, report, operatorName, operatorMnc, place });
              };

              return (
                <Fragment key={`${report.kind}:${report.url}`}>
                  <DropdownMenuItem
                    render={showAntennaData ? undefined : <a target="_blank" rel="noopener noreferrer" href={report.url} />}
                    onClick={showAntennaData ? openAntennaDialog : undefined}
                  >
                    <ReportItemContent dateLabel={dateLabel} tag={t(`common:labels.${sourceLabel}`)} issuer={issuer}>
                      {isLatest ? (
                        <span className="shrink-0 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                          {t("common:labels.latest")}
                        </span>
                      ) : null}
                    </ReportItemContent>
                    {showAntennaData ? <span className="sr-only">{t("si2pemAntennaData.action")}</span> : null}
                    <HugeiconsIcon
                      icon={showAntennaData ? ArrowRight01Icon : ArrowUpRight01Icon}
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </DropdownMenuItem>
                  {installationDocument ? (
                    <DropdownMenuItem render={<a target="_blank" rel="noopener noreferrer" href={installationDocument} />}>
                      <ReportItemContent dateLabel={dateLabel} tag={t("specs.pemInstallationForm")} issuer={issuer} />
                      <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </DropdownMenuItem>
                  ) : null}
                </Fragment>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
