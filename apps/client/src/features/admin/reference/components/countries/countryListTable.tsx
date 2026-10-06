import { ArrowRight01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type RecordListEmptyState, RecordListMobileList, type RecordListStateProps, RecordListTable } from "../shared/recordListPrimitives";
import { CountryIdentity, CountryListNumber, CountryPlanSize, CountryRegionCount, CountryTeamSummary } from "./countryListCells";
import { COUNTRY_LIST_COLUMNS } from "./countryListColumns";
import { CountryContributionsBadge, CountryVisibilityBadge } from "./countryStatusBadges";
import type { CountryListRow } from "./useCountryListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type CountryListTableProps = Omit<RecordListStateProps, "emptyState"> & {
  rows: CountryListRow[];
  isMobile: boolean;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onOpenCountry?: (countryCode: string) => void;
};

type CountryListBodyProps = RecordListStateProps & {
  rows: CountryListRow[];
};

type CountryListDesktopTableProps = CountryListBodyProps & {
  onOpenCountry?: (countryCode: string) => void;
};

type CountryFactProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

const SKELETON_ROW_COUNT = 3;
const SKELETON_BAR_WIDTHS = ["w-20", "w-24", "w-8", "w-8", "w-8", "w-36", "w-14"];
const MOBILE_ROW_LINK_CLASS = cn(
  "block px-3 py-3 transition-colors hover:bg-muted/50",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
);

function getCountryRowId(row: CountryListRow): string {
  return row.country.code;
}

function getCountryHref(row: CountryListRow): string {
  return `/admin/countries/${row.country.code}`;
}

function CountryListSkeletonBody() {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3 pl-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width, columnIndex) => (
            <td key={columnIndex} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
          <td />
        </tr>
      ))}
    </tbody>
  );
}

function CountryListDesktopTable({ rows, viewState, emptyState, isRetrying, onRetry, onOpenCountry }: CountryListDesktopTableProps) {
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: COUNTRY_LIST_COLUMNS,
    getRowId: getCountryRowId,
    manualPagination: true,
  });

  function openRow(row: CountryListRow) {
    onOpenCountry?.(row.country.code);
  }

  return (
    <RecordListTable
      table={table}
      skeletonBody={<CountryListSkeletonBody />}
      getRowHref={getCountryHref}
      onRowClick={openRow}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    />
  );
}

function CountryFact({ label, className, children }: CountryFactProps) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-2", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function CountryMobileRow({ row }: { row: CountryListRow }) {
  const { t } = useTranslation("admin");

  return (
    <Link to="/admin/countries/$code" params={{ code: row.country.code }} className={MOBILE_ROW_LINK_CLASS}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <CountryIdentity row={row} />
        <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <CountryVisibilityBadge isVisible={row.country.isVisible} />
        <CountryContributionsBadge contributions={row.country.contributions} isLong />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        <CountryFact label={t("reference.country.regions.title")}>
          <CountryRegionCount count={row.regionCount} />
        </CountryFact>
        <CountryFact label={t("nav:items.operators")}>
          <CountryListNumber count={row.operatorCount} />
        </CountryFact>
        <CountryFact label={t("reference.country.bandPlan.title")}>
          <CountryPlanSize count={row.planSize} />
        </CountryFact>
        <CountryFact label={t("reference.country.regions.columns.activeStations")}>
          <CountryListNumber count={row.activeStations} />
        </CountryFact>
        <CountryFact label={t("reference.country.team.title")} className="col-span-2">
          <CountryTeamSummary team={row.team} />
        </CountryFact>
      </dl>
    </Link>
  );
}

function CountryMobileRowSkeleton() {
  return (
    <div className="space-y-2.5 px-3 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex gap-1">
        <Skeleton className="h-5 w-20 rounded-4xl" />
        <Skeleton className="h-5 w-32 rounded-4xl" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function CountryListMobileList({ rows, viewState, emptyState, isRetrying, onRetry }: CountryListBodyProps) {
  return (
    <RecordListMobileList
      skeletonRow={<CountryMobileRowSkeleton />}
      skeletonRowCount={SKELETON_ROW_COUNT}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    >
      {rows.map((row) => (
        <li key={row.country.code}>
          <CountryMobileRow row={row} />
        </li>
      ))}
    </RecordListMobileList>
  );
}

export function CountryListTable({
  rows,
  viewState,
  isMobile,
  isRetrying,
  emptyDescription,
  emptyAction,
  onRetry,
  onOpenCountry,
}: CountryListTableProps) {
  const { t } = useTranslation("admin");
  const emptyState: RecordListEmptyState = {
    icon: Globe02Icon,
    title: t("reference.countries.empty.title"),
    description: emptyDescription,
    action: emptyAction,
  };

  if (isMobile) return <CountryListMobileList rows={rows} viewState={viewState} emptyState={emptyState} isRetrying={isRetrying} onRetry={onRetry} />;

  return (
    <CountryListDesktopTable
      rows={rows}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
      onOpenCountry={onOpenCountry}
    />
  );
}
