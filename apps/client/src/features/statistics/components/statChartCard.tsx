import { type ReactNode, memo } from "react";
import { useTranslation } from "react-i18next";

import type { ChartType } from "./chartTypeContext";
import type { Series } from "./statChart";
import { StatChart } from "./statChart";
import type { ChartLegendVariant } from "@/components/evilcharts/ui/legend";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  data: Record<string, string | number>[];
  series: Series[];
  dataXKey: string;
  stacked?: boolean;
  height?: string;
  showBrush?: boolean;
  isLoading?: boolean;
  type?: ChartType;
  minWidth?: string;
  standalone?: boolean;
  showDelta?: boolean;
  connectNulls?: boolean;
  showDots?: boolean;
  legendVariant?: ChartLegendVariant;
}

export const StatChartCard = memo(function StatChartCard({
  title,
  description,
  toolbar,
  data,
  series,
  dataXKey,
  stacked,
  height = "h-72",
  showBrush,
  isLoading,
  type = "bar",
  minWidth,
  standalone = true,
  showDelta = false,
  connectNulls = false,
  showDots = true,
  legendVariant = "vertical-bar",
}: Props) {
  const resolvedMinWidth = minWidth ?? (standalone ? "min-w-[720px]" : "min-w-0");
  const { t } = useTranslation("statistics");

  const header = (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-sm font-medium leading-none">{title}</h3>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      {toolbar ? <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbar}</div> : null}
    </div>
  );

  const chart = (
    <StatChart
      type={type}
      data={data}
      series={series}
      stacked={stacked}
      className={height}
      showBrush={showBrush}
      isLoading={isLoading}
      dataXKey={dataXKey}
      showDelta={showDelta}
      connectNulls={connectNulls}
      showDots={showDots}
      legendVariant={legendVariant}
    />
  );

  let body: ReactNode;
  if (data.length === 0 && !isLoading) {
    body = <div className={cn("flex items-center justify-center p-4 text-muted-foreground text-xs", height)}>{t("charts.noData")}</div>;
  } else if (standalone) {
    body = (
      <div className="overflow-x-auto px-3 pb-3 pt-4 sm:px-4">
        <div className={cn(resolvedMinWidth, "w-full")}>{chart}</div>
      </div>
    );
  } else {
    body = <div className="px-3 pb-3 pt-4 sm:px-4">{chart}</div>;
  }

  return (
    <div className={standalone ? "relative border border-border" : undefined}>
      {header}
      <div>{body}</div>
    </div>
  );
});
