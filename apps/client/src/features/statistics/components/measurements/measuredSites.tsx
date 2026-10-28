import type { ObservationStatistics } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatPercent, toPercent } from "../../lib/format";
import { ColorBar } from "../blocks/colorBar";
import { BlockHeader } from "../card/statisticsCard";

type SiteStatus = keyof ObservationStatistics["sites"];

const SITE_STATUSES: readonly { status: SiteStatus; color: string }[] = [
  { status: "matched", color: "var(--chart-1)" },
  { status: "suggested", color: "var(--chart-2)" },
  { status: "unmatched", color: "var(--chart-3)" },
];

export function MeasuredSites({ sites }: { sites: ObservationStatistics["sites"] }) {
  const { t, i18n } = useTranslation("statistics");
  const total = sites.matched + sites.suggested + sites.unmatched;
  const rows = SITE_STATUSES.map(({ status, color }) => ({
    status,
    color,
    count: sites[status],
    label: t(`measurements.${status}`),
    share: formatPercent(toPercent(sites[status], total), i18n.language),
  }));

  return (
    <div>
      <BlockHeader title={t("measurements.sites")} description={t("measurements.sitesDescription")} />
      <div
        role="img"
        aria-label={rows.map((row) => `${row.label} ${row.count.toLocaleString(i18n.language)}`).join(", ")}
        className="mt-3 flex h-2.5 gap-0.5"
      >
        {rows.map((row) =>
          row.count > 0 ? (
            <span key={row.status} style={{ flex: `${row.count} 1 0px`, backgroundColor: row.color }} className="min-w-[3px] rounded-[3px]" />
          ) : null,
        )}
      </div>
      <ul className="mt-2.5">
        {rows.map((row) => (
          <li key={row.status} className="flex h-7 items-center gap-2.5">
            <ColorBar color={row.color} className="h-3" />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-5">{row.label}</span>
            <span className="text-[0.8125rem] leading-5 font-semibold tabular-nums">{row.count.toLocaleString(i18n.language)}</span>
            <span className="w-13 text-right text-xs text-muted-foreground tabular-nums">{row.share}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
