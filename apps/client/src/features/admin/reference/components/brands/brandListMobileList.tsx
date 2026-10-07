import type { Brand } from "../../types";
import { BrandTile } from "../shared/brandTile";
import { RecordListMobileList, type RecordListStateProps } from "../shared/recordListPrimitives";
import { BrandColorValue, BrandLogoInfo } from "./brandListCells";
import { BrandRowActions } from "./brandListColumns";
import type { BrandListRow } from "./useBrandListRows";
import { Skeleton } from "@/components/ui/skeleton";

type BrandListMobileListProps = RecordListStateProps & {
  rows: BrandListRow[];
};

const SKELETON_ROW_COUNT = 6;

function BrandMobileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-40 max-w-full" />
      </div>
    </div>
  );
}

function BrandMobileRow({ brand }: { brand: Brand }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <BrandTile brand={brand} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">{brand.name}</p>
        <p className="truncate font-mono text-xs leading-4 text-muted-foreground">{brand.slug}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <BrandColorValue color={brand.color} className="text-xs" />
          <BrandLogoInfo logo={brand.logo} />
        </div>
      </div>
      <BrandRowActions brand={brand} />
    </div>
  );
}

export function BrandListMobileList({ rows, viewState, emptyState, isRetrying, onRetry }: BrandListMobileListProps) {
  return (
    <RecordListMobileList
      skeletonRow={<BrandMobileRowSkeleton />}
      skeletonRowCount={SKELETON_ROW_COUNT}
      viewState={viewState}
      emptyState={emptyState}
      isRetrying={isRetrying}
      onRetry={onRetry}
    >
      {rows.map(({ brand }) => (
        <li key={brand.id}>
          <BrandMobileRow brand={brand} />
        </li>
      ))}
    </RecordListMobileList>
  );
}
