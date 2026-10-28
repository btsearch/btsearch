import { useTranslation } from "react-i18next";

import type { OperatorCount } from "../../lib/chartData";
import { formatPercent, toPercent } from "../../lib/format";
import { BlockHeader, EmptyBlock } from "../card/statisticsCard";
import { ColorBar } from "./colorBar";
import { BrandMark } from "@/components/cellular/brandMark";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_LEGEND_WIDTHS = ["w-18", "w-22", "w-16", "w-20"];

export function OperatorShares({ title, counts }: { title: string; counts: readonly OperatorCount[] }) {
  const { t, i18n } = useTranslation("statistics");
  const total = counts.reduce((sum, count) => sum + count.value, 0);
  const shares = counts.map((count) => {
    const share = formatPercent(toPercent(count.value, total), i18n.language);
    return { ...count, share, description: `${count.operator.name}: ${count.value.toLocaleString(i18n.language)} (${share})` };
  });

  return (
    <div>
      <BlockHeader title={title} note={t("charts.total", { count: total })} />
      {shares.length === 0 ? (
        <EmptyBlock />
      ) : (
        <>
          <div role="img" aria-label={shares.map((share) => share.description).join(", ")} className="mt-3 flex h-2.5 gap-0.5">
            {shares.map((share) => (
              <span
                key={share.operator.id}
                style={{ flex: `${share.value} 1 0px`, backgroundColor: share.operator.color }}
                className="min-w-0.5 rounded-[3px]"
              />
            ))}
          </div>
          <ul className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(8.125rem,1fr))] gap-x-6 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {shares.map((share) => (
              <li key={share.operator.id} className="flex min-w-0 gap-2.5">
                <ColorBar color={share.operator.color} className="h-10" />
                <div className="min-w-0">
                  <p className="flex h-5 items-center gap-1.5 text-[0.8125rem] font-semibold whitespace-nowrap">
                    <BrandMark brand={share.operator.brand} />
                    <span className="truncate">{share.operator.name}</span>
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
                    <span className="text-base leading-5 font-bold tabular-nums">{share.value.toLocaleString(i18n.language)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{share.share}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function OperatorSharesSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="mt-3.5 h-2.5 w-full rounded-[3px]" />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {SKELETON_LEGEND_WIDTHS.map((width) => (
          <div key={width}>
            <Skeleton className={`h-3 ${width}`} />
            <Skeleton className="mt-2 h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
