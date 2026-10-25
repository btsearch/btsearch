import type { MeasurementContributor } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ContributorIdentity } from "../components/contributorIdentity";
import { formatShare } from "../utils/format";
import { LOW_WEIGHT_TEXT_CLASS } from "./contributorBadges";
import { ComputedWeight, type ContributorListRow, TrustBadges, getEffectiveWeightNote, getTermsNote } from "./contributorListCells";
import type { DataTableViewState } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { type RecordListEmptyState, RecordListMobileList } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ContributorListMobileListProps = {
  rows: ContributorListRow[];
  viewState: DataTableViewState;
  pageSize: number;
  fillHeight: number;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  listRef: (node: HTMLUListElement | null) => void;
  onRetry: () => unknown;
};

const MAX_SKELETON_ROWS = 8;
const PHANTOM_CELLS_WORTH_SHOWING = 10;
const ROW_LINK_CLASS = cn(
  "block px-3 py-2.5 transition-colors hover:bg-muted/50",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
);

function getTrackRecordDetail(t: TFunction, language: string, contributor: MeasurementContributor): string {
  const effectiveNote = getEffectiveWeightNote(t, language, contributor);
  if (contributor.vouch !== null && effectiveNote !== null) return effectiveNote;

  const { timingAdvanceAgreement, phantomCells, droppedShare } = contributor.trackRecord;
  const first =
    timingAdvanceAgreement === null
      ? t("measurements.contributors.mobile.noTimingAdvance")
      : t("measurements.contributors.mobile.timingAdvance", { share: formatShare(timingAdvanceAgreement, language) });
  const second =
    phantomCells >= PHANTOM_CELLS_WORTH_SHOWING
      ? t("measurements.contributors.mobile.phantom", { cells: phantomCells })
      : t("measurements.contributors.mobile.dropped", { share: formatShare(droppedShare, language) });
  return t("measurements.contributors.mobile.detail", { first, second });
}

function ContributorMobileRowSkeleton() {
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-2/3" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function ContributorMobileRow({ row }: { row: ContributorListRow }) {
  const { t, i18n } = useTranslation("admin");
  const { contributor, currentTermsVersion } = row;
  const terms = getTermsNote(t, contributor.termsVersion, currentTermsVersion);

  return (
    <Link to="/admin/measurements/contributors/$userId" params={{ userId: contributor.user.id }} className={ROW_LINK_CLASS}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <ContributorIdentity user={contributor.user} />
        <TrustBadges contributor={contributor} />
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <ComputedWeight weight={contributor.weight.computed} prefix={t("measurements.weight")} />
        <span className="min-w-0 truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
          {getTrackRecordDetail(t, i18n.language, contributor)}
        </span>
      </div>
      <div className="mt-2 flex min-h-4 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {contributor.firstUploadAt === null
            ? t("measurements.contributors.noUploads")
            : t("measurements.contributors.firstUploadOn", { date: formatShortDate(contributor.firstUploadAt, i18n.language) })}
        </span>
        <span className={cn("shrink-0", terms.isOutdated ? LOW_WEIGHT_TEXT_CLASS : "text-muted-foreground")}>{terms.text}</span>
      </div>
    </Link>
  );
}

export function ContributorListMobileList({
  rows,
  viewState,
  pageSize,
  fillHeight,
  emptyState,
  isRetrying,
  listRef,
  onRetry,
}: ContributorListMobileListProps) {
  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <RecordListMobileList
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRow={<ContributorMobileRowSkeleton />}
        skeletonRowCount={Math.min(pageSize, MAX_SKELETON_ROWS)}
        stateMinHeight={fillHeight}
        listRef={listRef}
      >
        {rows.map((row) => (
          <li key={row.contributor.user.id}>
            <ContributorMobileRow row={row} />
          </li>
        ))}
      </RecordListMobileList>
    </div>
  );
}
