import { type CellContext, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import { ContributorIdentity } from "../components/contributorIdentity";
import { type ContributorListRow, FirstUploadSummary, ShareValue, TrustSummary, WeightSummary } from "./contributorListCells";
import type { ContributorSort } from "./contributorsSearch";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type ContributorSortControl = {
  sort: ContributorSort;
  onSortChange: (sort: ContributorSort) => void;
};

type ContributorCellProps = Pick<CellContext<AppTableFeatures, ContributorListRow, unknown>, "row">;

const WEIGHT_COLUMN_ID = "weight";
const FIRST_UPLOAD_COLUMN_ID = "firstUploadAt";
const columnHelper = createColumnHelper<AppTableFeatures, ContributorListRow>();

export const ContributorSortContext = createContext<ContributorSortControl | null>(null);

function useContributorSort(): ContributorSortControl {
  const sortControl = useContext(ContributorSortContext);
  if (sortControl === null) throw new Error("The contributor list headers must render inside ContributorSortContext");
  return sortControl;
}

function ContributorHeader() {
  const { t } = useTranslation("admin");
  return <div className="pl-2">{t("measurements.contributor")}</div>;
}

function WeightHeader() {
  const { t } = useTranslation("admin");
  const { sort, onSortChange } = useContributorSort();
  const isActive = sort === "weight" || sort === "-weight";

  return (
    <DataTableSortButton
      label={t("measurements.weight")}
      isActive={isActive}
      isAscending={sort === "weight"}
      onClick={() => onSortChange(sort === "weight" ? "-weight" : "weight")}
    />
  );
}

function TimingAdvanceHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributors.columns.timingAdvance");
}

function DroppedHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributors.columns.dropped");
}

function MockHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributors.columns.mock");
}

function PhantomHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributors.columns.phantom");
}

function TrustHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributors.columns.trust");
}

function FirstUploadHeader() {
  const { t } = useTranslation("admin");
  const { sort, onSortChange } = useContributorSort();

  return (
    <DataTableSortButton
      label={t("measurements.contributors.columns.firstUpload")}
      isActive={sort === "firstUploadAt" || sort === "-firstUploadAt"}
      isAscending={sort === "firstUploadAt"}
      onClick={() => onSortChange(sort === "-firstUploadAt" ? "firstUploadAt" : "-firstUploadAt")}
    />
  );
}

function ContributorCell({ row }: ContributorCellProps) {
  return (
    <div className="pl-2">
      <ContributorIdentity user={row.original.contributor.user} />
    </div>
  );
}

function WeightCell({ row }: ContributorCellProps) {
  return <WeightSummary contributor={row.original.contributor} />;
}

function TimingAdvanceCell({ row }: ContributorCellProps) {
  return <ShareValue value={row.original.contributor.trackRecord.timingAdvanceAgreement} />;
}

function DroppedCell({ row }: ContributorCellProps) {
  return <ShareValue value={row.original.contributor.trackRecord.droppedShare} />;
}

function MockCell({ row }: ContributorCellProps) {
  return <ShareValue value={row.original.contributor.trackRecord.mockShare} />;
}

function PhantomCell({ row }: ContributorCellProps) {
  const { i18n } = useTranslation();
  return <span className="tabular-nums">{row.original.contributor.trackRecord.phantomCells.toLocaleString(i18n.language)}</span>;
}

function TrustCell({ row }: ContributorCellProps) {
  return <TrustSummary contributor={row.original.contributor} />;
}

function FirstUploadCell({ row }: ContributorCellProps) {
  return <FirstUploadSummary row={row.original} />;
}

export const CONTRIBUTOR_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "contributor", size: 280, header: ContributorHeader, cell: ContributorCell }),
  columnHelper.display({ id: WEIGHT_COLUMN_ID, size: 200, header: WeightHeader, cell: WeightCell }),
  columnHelper.display({ id: "timingAdvance", size: 120, header: TimingAdvanceHeader, cell: TimingAdvanceCell }),
  columnHelper.display({ id: "dropped", size: 110, header: DroppedHeader, cell: DroppedCell }),
  columnHelper.display({ id: "mock", size: 170, header: MockHeader, cell: MockCell }),
  columnHelper.display({ id: "phantom", size: 140, header: PhantomHeader, cell: PhantomCell }),
  columnHelper.display({ id: "trust", size: 240, header: TrustHeader, cell: TrustCell }),
  columnHelper.display({ id: FIRST_UPLOAD_COLUMN_ID, size: 156, header: FirstUploadHeader, cell: FirstUploadCell }),
]);

export const CONTRIBUTOR_LIST_SORTING: Record<ContributorSort, SortingState> = {
  weight: [{ id: WEIGHT_COLUMN_ID, desc: false }],
  "-weight": [{ id: WEIGHT_COLUMN_ID, desc: true }],
  firstUploadAt: [{ id: FIRST_UPLOAD_COLUMN_ID, desc: false }],
  "-firstUploadAt": [{ id: FIRST_UPLOAD_COLUMN_ID, desc: true }],
};
