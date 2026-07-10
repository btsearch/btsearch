import { useCallback, useMemo, useRef, useState } from "react";

interface UseTablePageSizeOptions {
  rowHeight?: number;
  headerHeight?: number;
  paginationHeight?: number;
  minRows?: number;
  maxRows?: number;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

interface InternalState {
  pageIndex: number;
  pageSize: number;
  autoPageSize: number;
}

const EXTRA_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export function useTablePagination(options: UseTablePageSizeOptions = {}) {
  const { rowHeight = 52, headerHeight = 48, paginationHeight = 52, minRows = 5, maxRows = 100 } = options;

  const isManualRef = useRef(false);
  const [state, setState] = useState<InternalState>(() => ({
    pageIndex: 0,
    pageSize: minRows,
    autoPageSize: minRows,
  }));

  const observerRef = useRef<ResizeObserver | null>(null);

  const pagination = useMemo(() => ({ pageIndex: state.pageIndex, pageSize: state.pageSize }), [state.pageIndex, state.pageSize]);

  const setPagination = useCallback((updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
    setState((prev) => {
      const prevPag: PaginationState = { pageIndex: prev.pageIndex, pageSize: prev.pageSize };
      const next = typeof updater === "function" ? updater(prevPag) : updater;
      if (next.pageSize !== prev.pageSize) isManualRef.current = next.pageSize !== prev.autoPageSize;
      return { ...prev, pageIndex: next.pageIndex, pageSize: next.pageSize };
    });
  }, []);

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      const calculatePageSize = () => {
        const styles = window.getComputedStyle(node);
        const verticalPadding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
        const availableHeight = node.clientHeight - verticalPadding - headerHeight - paginationHeight;
        const possibleRows = Math.floor(availableHeight / rowHeight);
        const clampedRows = Math.max(minRows, Math.min(possibleRows, maxRows));

        setState((prev) => {
          const newPageSize = isManualRef.current ? prev.pageSize : clampedRows;
          if (prev.autoPageSize === clampedRows && prev.pageSize === newPageSize) return prev;
          return { ...prev, autoPageSize: clampedRows, pageSize: newPageSize };
        });
      };

      calculatePageSize();

      observerRef.current = new ResizeObserver(calculatePageSize);
      observerRef.current.observe(node);
    },
    [rowHeight, headerHeight, paginationHeight, minRows, maxRows],
  );

  const pageSizeOptions = useMemo(() => [...new Set([state.autoPageSize, ...EXTRA_PAGE_SIZE_OPTIONS])].sort((a, b) => a - b), [state.autoPageSize]);

  return { containerRef, pagination, setPagination, autoPageSize: state.autoPageSize, pageSizeOptions };
}
