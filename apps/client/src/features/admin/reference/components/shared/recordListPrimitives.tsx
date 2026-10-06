import { Add01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { RowData, Table } from "@tanstack/react-table";
import { type CSSProperties, Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { REFERENCE_LIST_STATE_ROWS, REFERENCE_LIST_TABLE_CLASS } from "./referenceListPage";
import { SearchField } from "./searchField";
import { Button } from "@/components/ui/button";
import { DATA_TABLE_ROW_HEIGHT, DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppTableFeatures } from "@/lib/tableFeatures";

export type RecordListEmptyState = {
  icon: IconSvgElement;
  title: string;
  description?: string;
  action?: ReactNode;
};

export type RecordListStateProps = {
  viewState: DataTableViewState;
  emptyState: RecordListEmptyState;
  isRetrying?: boolean;
  onRetry?: () => unknown;
};

type AddRecordButtonProps = {
  label: string;
  isCompactOnPhones?: boolean;
  onClick: () => void;
};

type RecordListTableProps<TRow extends RowData> = RecordListStateProps & {
  table: Table<AppTableFeatures, TRow>;
  skeletonBody: ReactNode;
  rowClassName?: string;
  getRowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
};

type RecordListMobileListProps = RecordListStateProps & {
  skeletonRow: ReactNode;
  skeletonRowCount: number;
  stateMinHeight?: CSSProperties["minHeight"];
  listRef?: (node: HTMLUListElement | null) => void;
  children: ReactNode;
};

type MobileSearchChipProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
};

export function AddRecordButton({ label, isCompactOnPhones = false, onClick }: AddRecordButtonProps) {
  return (
    <Button type="button" className="cursor-pointer" onClick={onClick}>
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
      <span className={isCompactOnPhones ? "max-md:sr-only" : undefined}>{label}</span>
    </Button>
  );
}

export function RecordListTable<TRow extends RowData>({
  table,
  skeletonBody,
  rowClassName,
  getRowHref,
  onRowClick,
  viewState,
  emptyState,
  isRetrying,
  onRetry,
}: RecordListTableProps<TRow>) {
  const columnCount = table.getAllLeafColumns().length;

  return (
    <DataTable.Root table={table} className={REFERENCE_LIST_TABLE_CLASS}>
      <DataTable.Table>
        <DataTable.Header />
        {viewState === "loading" ? skeletonBody : null}
        {viewState === "error" ? (
          <DataTable.Error columns={columnCount} rows={REFERENCE_LIST_STATE_ROWS} onRetry={onRetry} isRetrying={isRetrying} />
        ) : null}
        {viewState === "empty" ? <DataTable.EmptyState columns={columnCount} rows={REFERENCE_LIST_STATE_ROWS} {...emptyState} /> : null}
        {viewState === "ready" ? <DataTable.Body rowClassName={rowClassName} getRowHref={getRowHref} onRowClick={onRowClick} /> : null}
      </DataTable.Table>
    </DataTable.Root>
  );
}

export function RecordListMobileList({
  skeletonRow,
  skeletonRowCount,
  stateMinHeight = REFERENCE_LIST_STATE_ROWS * DATA_TABLE_ROW_HEIGHT,
  listRef,
  viewState,
  emptyState,
  isRetrying,
  onRetry,
  children,
}: RecordListMobileListProps) {
  const stateStyle = { minHeight: stateMinHeight };

  if (viewState === "loading") {
    return (
      <div className="divide-y" aria-hidden="true">
        {Array.from({ length: skeletonRowCount }, (_, index) => (
          <Fragment key={index}>{skeletonRow}</Fragment>
        ))}
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="flex flex-col p-3" style={stateStyle}>
        <ErrorState className="flex-1" onRetry={onRetry} isRetrying={isRetrying} />
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div role="status" className="flex flex-col p-3" style={stateStyle}>
        <ErrorState tone="neutral" className="flex-1" {...emptyState} />
      </div>
    );
  }

  return (
    <ul ref={listRef} className="divide-y">
      {children}
    </ul>
  );
}

export function MobileSearchChip({ value, onChange, placeholder, maxLength }: MobileSearchChipProps) {
  const { t } = useTranslation("common");
  const label = t("labels.search");

  return (
    <MobileFilterChip active={value.trim() !== ""} icon={Search01Icon} label={label}>
      <MobileFilterPanelTitle>{label}</MobileFilterPanelTitle>
      <SearchField
        value={value}
        onChange={onChange}
        label={label}
        placeholder={placeholder}
        showLabel={false}
        maxLength={maxLength}
        inputClassName="h-9"
      />
    </MobileFilterChip>
  );
}

export function MobileClearFiltersButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("common");
  const label = t("actions.clearAll");

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        render={<Button type="button" variant="outline" size="icon" className="cursor-pointer rounded-full text-muted-foreground" />}
        onClick={onClick}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
