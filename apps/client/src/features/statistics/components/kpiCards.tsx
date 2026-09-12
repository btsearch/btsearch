import NumberFlow, { continuous } from "@number-flow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StatsSummary } from "../api";
import { Skeleton } from "@/components/ui/skeleton";

const RAT_ORDER = ["NR", "LTE", "UMTS", "CDMA", "GSM", "IOT"];

function magnitudeFloor(n: number): number {
  if (n <= 0) return 0;
  return Math.pow(10, Math.floor(Math.log10(n)));
}

const FLOW_PROPS = {
  plugins: [continuous],
  transformTiming: { duration: 1200, easing: "ease-out" },
  spinTiming: { duration: 1200, easing: "ease-out" },
  opacityTiming: { duration: 400, easing: "ease-out" },
};

function useContainerVisible() {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observerRef.current?.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observerRef.current.observe(el);
  }, []);

  return { ref, visible };
}

function KpiSkeleton() {
  return (
    <div className="relative border border-border">
      <div className="flex flex-wrap gap-x-8 gap-y-4 px-5 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  visible,
  locale,
  description,
}: {
  label: string;
  value: number;
  visible: boolean;
  locale: string;
  description?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">
        <NumberFlow {...FLOW_PROPS} value={visible ? value : magnitudeFloor(value)} locales={locale} />
      </p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function UkeKpiCards({ data, isLoading }: { data?: StatsSummary; isLoading: boolean }) {
  const { t, i18n } = useTranslation("statistics");
  const { ref, visible } = useContainerVisible();

  const sortedRats = useMemo(() => (data ? [...data.by_rat].sort((a, b) => RAT_ORDER.indexOf(a.rat) - RAT_ORDER.indexOf(b.rat)) : []), [data]);

  if (isLoading) return <KpiSkeleton />;
  if (!data) return null;

  return (
    <div ref={ref} className="relative border border-border">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-4">
        <KpiTile label={t("kpi.totalPermits")} value={data.total_permits} visible={visible} locale={i18n.language} />
        <KpiTile label={t("kpi.totalStations")} value={data.total_unique_stations} visible={visible} locale={i18n.language} />
        <div className="hidden w-px self-stretch bg-border shrink-0 sm:block" />
        {sortedRats.map((rat) => (
          <KpiTile
            key={rat.rat}
            label={rat.rat}
            value={rat.unique_stations}
            visible={visible}
            locale={i18n.language}
            description={`${Number(rat.share_pct).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}% · ${t("stationDetails:permits.permitsCount", { count: rat.permits, formatParams: { val: { lng: i18n.language } } })}`}
          />
        ))}
      </div>
    </div>
  );
}

export function InternalKpiCards({ data, isLoading }: { data?: StatsSummary; isLoading: boolean }) {
  const { t, i18n } = useTranslation("statistics");
  const { ref, visible } = useContainerVisible();

  const sortedRats = useMemo(
    () => (data ? [...data.internal.by_rat].sort((a, b) => RAT_ORDER.indexOf(a.rat) - RAT_ORDER.indexOf(b.rat)) : []),
    [data],
  );

  if (isLoading) return <KpiSkeleton />;
  if (!data) return null;

  return (
    <div ref={ref} className="relative border border-border">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-4">
        <KpiTile label={t("kpi.totalInternalStations")} value={data.internal.total_stations} visible={visible} locale={i18n.language} />
        <KpiTile label={t("kpi.totalCells")} value={data.internal.total_cells} visible={visible} locale={i18n.language} />
        <div className="hidden w-px self-stretch bg-border shrink-0 sm:block" />
        {sortedRats.map((rat) => (
          <KpiTile
            key={rat.rat}
            label={rat.rat}
            value={rat.cells}
            visible={visible}
            locale={i18n.language}
            description={`${Number(rat.share_pct).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}% · ${t("stations:stationsCount", { count: rat.stations })}`}
          />
        ))}
      </div>
    </div>
  );
}
