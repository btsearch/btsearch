import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatPlmn } from "../../utils/plmn";
import { BrandTile } from "../shared/brandTile";
import type { Loadable } from "../shared/loadable";
import { RecordListMobileList, type RecordListStateProps } from "../shared/recordListPrimitives";
import type { OperatorListRow } from "./useOperatorListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type OperatorListMobileListProps = RecordListStateProps & {
  rows: OperatorListRow[];
};

const SKELETON_ROW_COUNT = 8;
const FACT_SEPARATOR = " · ";
const ROW_LINK_CLASS = cn(
  "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
);

function listOperatorFacts(row: OperatorListRow): string[] {
  const { primaryPlmn, shortCode } = row.operator;
  const facts: string[] = [];
  if (primaryPlmn !== null) facts.push(formatPlmn(primaryPlmn));
  if (shortCode !== null) facts.push(shortCode);
  for (const network of row.networks) facts.push(network.name);
  return facts;
}

function OperatorMobileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-3.5 w-14 shrink-0" />
    </div>
  );
}

function OperatorMobileStations({ stationCount }: { stationCount: Loadable<number> }) {
  const { t, i18n } = useTranslation("admin");

  if (stationCount.state === "loading") return <Skeleton aria-hidden="true" className="h-3.5 w-14 shrink-0" />;
  if (stationCount.state === "failed") return null;

  const stations = stationCount.value;

  return (
    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
      <span className={cn("tabular-nums", stations > 0 && "text-foreground")}>{stations.toLocaleString(i18n.language)}</span>{" "}
      {t("reference.operators.mobile.stations", { count: stations })}
    </span>
  );
}

function OperatorMobileRow({ row }: { row: OperatorListRow }) {
  const { t } = useTranslation("admin");
  const facts = listOperatorFacts(row);

  return (
    <Link to="/admin/operators/$id" params={{ id: String(row.operator.id) }} className={ROW_LINK_CLASS}>
      <BrandTile brand={row.brand} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.operator.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground tabular-nums">
          {facts.length > 0 ? facts.join(FACT_SEPARATOR) : t("reference.operators.mobile.noPlmn")}
        </div>
      </div>
      <OperatorMobileStations stationCount={row.stationCount} />
    </Link>
  );
}

export function OperatorListMobileList({ rows, viewState, emptyState, isRetrying, onRetry }: OperatorListMobileListProps) {
  return (
    <RecordListMobileList
      skeletonRow={<OperatorMobileRowSkeleton />}
      skeletonRowCount={SKELETON_ROW_COUNT}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    >
      {rows.map((row) => (
        <li key={row.operator.id}>
          <OperatorMobileRow row={row} />
        </li>
      ))}
    </RecordListMobileList>
  );
}
