import { useTranslation } from "react-i18next";

import { RecordListMobileList, type RecordListStateProps } from "../shared/recordListPrimitives";
import { OwnerCountry, OwnerTile, useOwnerLocationCount } from "./structureOwnerListCells";
import { OwnerRowActions } from "./structureOwnerListColumns";
import type { StructureOwnerListRow } from "./useStructureOwnerListRows";
import { Skeleton } from "@/components/ui/skeleton";

type StructureOwnerListMobileListProps = RecordListStateProps & {
  rows: StructureOwnerListRow[];
};

const SKELETON_ROW_COUNT = 6;

function OwnerMobileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36 max-w-full" />
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
    </div>
  );
}

function OwnerMobileLocationCount({ ownerId }: { ownerId: number }) {
  const { t } = useTranslation("admin");
  const locations = useOwnerLocationCount(ownerId);

  if (locations.state === "loading") return <Skeleton className="h-3 w-16" />;
  if (locations.state === "failed") return null;
  return <span className="shrink-0 tabular-nums">{t("auditLogs.counts.locations", { count: locations.value })}</span>;
}

function OwnerMobileRow({ row }: { row: StructureOwnerListRow }) {
  const { owner } = row;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <OwnerTile brand={row.brand} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">{owner.name}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2.5 text-xs leading-4 text-muted-foreground">
          <OwnerCountry countryCode={owner.countryCode} />
          <OwnerMobileLocationCount ownerId={owner.id} />
        </div>
      </div>
      <OwnerRowActions owner={owner} />
    </div>
  );
}

export function StructureOwnerListMobileList({ rows, viewState, emptyState, isRetrying, onRetry }: StructureOwnerListMobileListProps) {
  return (
    <RecordListMobileList
      skeletonRow={<OwnerMobileRowSkeleton />}
      skeletonRowCount={SKELETON_ROW_COUNT}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    >
      {rows.map((row) => (
        <li key={row.owner.id}>
          <OwnerMobileRow row={row} />
        </li>
      ))}
    </RecordListMobileList>
  );
}
