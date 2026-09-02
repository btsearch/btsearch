import { type HeaderGroup, type Header as HeaderType, type Row, type RowData, type Table as TableInstance, flexRender } from "@tanstack/react-table";
import { type ReactNode, createContext, memo, useContext, useId, useMemo } from "react";

import { hasModifierKey, isInteractiveTarget } from "@/lib/keyboard";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

export const DATA_TABLE_ROW_HEIGHT = 64;
export const DATA_TABLE_HEADER_HEIGHT = 40;
export const DATA_TABLE_PAGINATION_HEIGHT = 49;

export type DataTableViewState = "loading" | "error" | "empty" | "ready";

export function getDataTableViewState(showLoading: boolean, showError: boolean, hasRows: boolean): DataTableViewState {
  if (showLoading) return "loading";
  if (showError) return "error";
  return hasRows ? "ready" : "empty";
}

// Context for sharing table instance
const DataTableContext = createContext<TableInstance<AppTableFeatures, RowData> | null>(null);

function useDataTable<T extends RowData>() {
  const table = useContext(DataTableContext) as unknown as TableInstance<AppTableFeatures, T> | null;
  if (!table) throw new Error("DataTable components must be used within DataTable.Root");
  return table;
}

// Root component
interface RootProps<T extends RowData> {
  table: TableInstance<AppTableFeatures, T>;
  children: ReactNode;
  className?: string;
}

function Root<T extends RowData>({ table, children, className }: RootProps<T>) {
  return (
    <DataTableContext.Provider value={table as TableInstance<AppTableFeatures, RowData>}>
      <div
        className={cn("inline-block min-w-full rounded-lg border bg-card overflow-hidden", className)}
        style={{ minWidth: `max(100%, ${table.getTotalSize()}px)` }}
      >
        {children}
      </div>
    </DataTableContext.Provider>
  );
}

// Table element
function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full caption-bottom text-sm table-fixed", className)}>{children}</table>;
}

function getAriaSort(sort: false | "asc" | "desc"): "ascending" | "descending" | undefined {
  if (sort === "asc") return "ascending";
  if (sort === "desc") return "descending";
  return undefined;
}

// Header
function Header({ className }: { className?: string }) {
  const table = useDataTable();
  return (
    <thead className={cn("sticky top-0 z-10 bg-card [&_tr]:border-b", className)}>
      {table.getHeaderGroups().map((headerGroup: HeaderGroup<AppTableFeatures, RowData>) => (
        <tr key={headerGroup.id} className="border-b transition-colors hover:bg-transparent">
          {headerGroup.headers.map((header: HeaderType<AppTableFeatures, RowData, unknown>) => (
            <th
              key={header.id}
              className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap"
              style={{ width: header.getSize() }}
              aria-sort={getAriaSort(header.column.getIsSorted())}
            >
              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );
}

// Memoized row component
interface TableRowProps<T extends RowData> {
  row: Row<AppTableFeatures, T>;
  onClick?: (row: T) => void;
  getRowHref?: (row: T) => string;
  getAriaLabel?: (row: T) => string;
  className?: string;
}

function TableRowInner<T extends RowData>({ row, onClick, getRowHref, getAriaLabel, className }: TableRowProps<T>) {
  const primaryCellId = useId();
  const href = getRowHref?.(row.original);
  const ariaLabel = getAriaLabel?.(row.original);
  const isInteractive = Boolean(onClick || href);
  const activate = () => {
    if (onClick) onClick(row.original);
    else if (href) window.location.assign(href);
  };
  const primaryActionClassName =
    "pointer-events-none absolute inset-1 z-20 rounded-md opacity-0 outline-none focus:pointer-events-auto focus:opacity-100 focus:ring-2 focus:ring-ring";

  return (
    <tr
      data-state={row.getIsSelected() && "selected"}
      className={cn("h-16 border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", isInteractive && "cursor-pointer", className)}
      onClick={(event) => {
        if (isInteractiveTarget(event.target, event.currentTarget)) return;
        if (href && (event.metaKey || event.ctrlKey || event.shiftKey)) {
          window.open(href, "_blank");
          return;
        }
        activate();
      }}
      onMouseDown={(event) => {
        if (event.button === 1 && href && !isInteractiveTarget(event.target, event.currentTarget)) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1 || !href || isInteractiveTarget(event.target, event.currentTarget)) return;
        window.open(href, "_blank");
      }}
    >
      {row.getVisibleCells().map((cell, index) => {
        const isPrimaryCell = index === 0 && isInteractive;
        let primaryAction: ReactNode = null;
        if (isPrimaryCell && href)
          primaryAction = (
            <a
              href={href}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : primaryCellId}
              className={primaryActionClassName}
              onClick={(event) => {
                if (!onClick || hasModifierKey(event)) return;
                event.preventDefault();
                onClick(row.original);
              }}
            />
          );
        else if (isPrimaryCell && onClick)
          primaryAction = (
            <button
              type="button"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : primaryCellId}
              className={primaryActionClassName}
              onClick={() => onClick(row.original)}
            />
          );

        return (
          <td key={cell.id} className={cn("p-2 align-middle overflow-hidden", isPrimaryCell && "relative")} style={{ width: cell.column.getSize() }}>
            {primaryAction}
            {isPrimaryCell ? (
              <div id={primaryCellId} className="contents">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ) : (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </td>
        );
      })}
    </tr>
  );
}

const TableRow = memo(TableRowInner) as typeof TableRowInner;

// Body with rows
interface BodyProps<T extends RowData> {
  onRowClick?: (row: T) => void;
  getRowHref?: (row: T) => string;
  getRowAriaLabel?: (row: T) => string;
  rowClassName?: string;
  skeletonRows?: number;
  skeletonColumns?: number;
}

function Body<T extends RowData>({ onRowClick, getRowHref, getRowAriaLabel, rowClassName, skeletonRows, skeletonColumns }: BodyProps<T>) {
  const table = useDataTable<T>();
  const rows = table.getRowModel().rows;

  return (
    <tbody className="[&_tr:last-child]:border-0">
      {rows.map((row: Row<AppTableFeatures, T>) => (
        <TableRow key={row.id} row={row} onClick={onRowClick} getRowHref={getRowHref} getAriaLabel={getRowAriaLabel} className={rowClassName} />
      ))}
      {skeletonRows !== null && skeletonRows !== undefined && skeletonRows > 0 && skeletonColumns !== null && skeletonColumns !== undefined && (
        <SkeletonRows rows={skeletonRows} columns={skeletonColumns} />
      )}
    </tbody>
  );
}

// Skeleton loading state - memoized arrays
interface SkeletonProps {
  rows: number;
  columns: number;
}

function Skeleton({ rows, columns }: SkeletonProps) {
  const rowArray = useMemo(() => Array.from({ length: rows }, (_, i) => i), [rows]);
  const colArray = useMemo(() => Array.from({ length: columns }, (_, i) => i), [columns]);

  return (
    <tbody className="[&_tr:last-child]:border-0" aria-hidden="true">
      {rowArray.map((rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b transition-colors">
          {colArray.map((colIndex) => (
            <td key={colIndex} className="p-2 align-middle">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// Skeleton rows without tbody wrapper - for appending to existing body
interface SkeletonRowsProps {
  rows: number;
  columns: number;
}

function SkeletonRows({ rows, columns }: SkeletonRowsProps) {
  const rowArray = useMemo(() => Array.from({ length: rows }, (_, i) => i), [rows]);
  const colArray = useMemo(() => Array.from({ length: columns }, (_, i) => i), [columns]);

  return (
    <>
      {rowArray.map((rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} className="h-16 border-b transition-colors">
          {colArray.map((colIndex) => (
            <td key={colIndex} className="p-2 align-middle">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Empty state
interface EmptyProps {
  columns: number;
  children: ReactNode;
}

function Empty({ columns, children }: EmptyProps) {
  return (
    <tr>
      <td colSpan={columns} className="h-32 text-center p-2">
        {children}
      </td>
    </tr>
  );
}

interface PaginationFooterProps {
  children: ReactNode;
  className?: string;
}

const paginationFooterClassName = "shrink-0 rounded-b-lg border border-t bg-muted px-2 py-2";

function PaginationFooter({ children, className }: PaginationFooterProps) {
  return <div className={cn(paginationFooterClassName, className)}>{children}</div>;
}

export const DataTable = {
  Root,
  Table,
  Header,
  Body,
  Skeleton,
  SkeletonRows,
  Empty,
  PaginationFooter,
};
