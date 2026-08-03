import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { PemReport } from "../api";

const SI2PEM_LOGO_STYLE: CSSProperties = {
  aspectRatio: "2435/521",
  maskImage: "url(/si2pem.svg)",
  WebkitMaskImage: "url(/si2pem.svg)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
};

type ReportItem = {
  report: PemReport;
  dateLabel: string;
  sourceLabel: "pemSourceGenerated" | "pemSourceSearch";
};

export function Si2pemReportsMenu({ reports }: { reports: PemReport[] }) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);

  const reportsByYear = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long" });
    const sorted = [...reports].sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map<string, ReportItem[]>();
    for (const report of sorted) {
      const year = report.date.slice(0, 4);
      const item: ReportItem = {
        report,
        dateLabel: formatter.format(new Date(report.date)),
        sourceLabel: report.source === "map" ? "pemSourceGenerated" : "pemSourceSearch",
      };
      const group = groups.get(year);
      if (group) group.push(item);
      else groups.set(year, [item]);
    }
    return [...groups.entries()];
  }, [reports, i18n.language]);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 hover:bg-muted rounded transition-colors cursor-pointer" />
          }
        >
          <span aria-hidden="true" className="block h-3.5 bg-[#2e2e5a] dark:bg-[#9898ce]" style={SI2PEM_LOGO_STYLE} />
          <span className="text-xs text-muted-foreground tabular-nums">{reports.length}</span>
        </TooltipTrigger>
        <TooltipContent>{t("specs.si2pemLink")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" sideOffset={4} positionerClassName="z-[9999]" className="min-w-84 max-h-80 overflow-y-auto">
        {reportsByYear.map(([year, items], groupIndex) => (
          <DropdownMenuGroup key={year}>
            <DropdownMenuLabel className="py-1 text-xs font-medium text-muted-foreground">{year}</DropdownMenuLabel>
            {items.map(({ report, dateLabel, sourceLabel }, index) => (
              <DropdownMenuItem
                key={`${report.station_id}_${report.date}_${report.source}`}
                render={<a target="_blank" href={report.details.document_url} />}
              >
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-sm font-medium">{dateLabel}</span>
                    <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">{t(`common:labels.${sourceLabel}`)}</span>
                    {groupIndex === 0 && index === 0 ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                        {t("common:labels.latest")}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{report.details.lab_name}</span>
                </div>
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
