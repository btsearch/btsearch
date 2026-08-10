import { type HeaderGroup, type Header as HeaderType, type Row, type RowData, type Table as TableInstance, flexRender } from "@tanstack/react-table";
import { type ReactNode, createContext, memo, useContext, useMemo } from "react";

import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

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
      <div className={cn("inline-block min-w-full rounded-lg border bg-card overflow-hidden", className)}>{children}</div>
    </DataTableContext.Provider>
  );
}

// Table element
function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full caption-bottom text-sm table-fixed", className)}>{children}</table>;
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
  className?: string;
}

const TableRowInner = <T extends RowData>({ row, onClick, getRowHref, className }: TableRowProps<T>) => (
  <tr
    data-state={row.getIsSelected() && "selected"}
    className={cn("h-16 border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", onClick && "cursor-pointer", className)}
    onClick={() => onClick?.(row.original)}
    onMouseDown={(e) => {
      if (e.button === 1) e.preventDefault();
    }}
    onAuxClick={(e) => {
      if (e.button === 1 && getRowHref) window.open(getRowHref(row.original), "_blank");
    }}
  >
    {row.getVisibleCells().map((cell) => (
      <td key={cell.id} className="p-2 align-middle overflow-hidden" style={{ width: cell.column.getSize() }}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </td>
    ))}
  </tr>
);

const TableRow = memo(TableRowInner) as typeof TableRowInner;

// Body with rows
interface BodyProps<T extends RowData> {
  onRowClick?: (row: T) => void;
  getRowHref?: (row: T) => string;
  rowClassName?: string;
  skeletonRows?: number;
  skeletonColumns?: number;
}

function Body<T extends RowData>({ onRowClick, getRowHref, rowClassName, skeletonRows, skeletonColumns }: BodyProps<T>) {
  const table = useDataTable<T>();
  const rows = table.getRowModel().rows;

  return (
    <tbody className="[&_tr:last-child]:border-0">
      {rows.map((row: Row<AppTableFeatures, T>) => (
        <TableRow key={row.id} row={row} onClick={onRowClick} getRowHref={getRowHref} className={rowClassName} />
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
    <tbody className="[&_tr:last-child]:border-0">
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

// Footer
interface FooterProps {
  columns: number;
  children: ReactNode;
  className?: string;
}

function Footer({ columns, children, className }: FooterProps) {
  return (
    <tfoot className={cn("sticky bottom-0 bg-card", className)}>
      <tr>
        <td colSpan={columns} className="border-t bg-muted/30 py-2 px-2">
          {children}
        </td>
      </tr>
    </tfoot>
  );
}

export const DataTable = {
  Root,
  Table,
  Header,
  Body,
  Skeleton,
  SkeletonRows,
  Empty,
  Footer,
};
