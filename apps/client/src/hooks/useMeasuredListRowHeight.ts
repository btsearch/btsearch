import { useCallback, useRef, useState } from "react";

const ROW_HEIGHT_SAFETY_BUFFER = 2;

interface MeasuredListRowHeightOptions {
  round?: boolean;
  safetyBuffer?: number;
}

export function useMeasuredListRowHeight(
  fallbackRowHeight: number,
  { round = true, safetyBuffer = ROW_HEIGHT_SAFETY_BUFFER }: MeasuredListRowHeightOptions = {},
) {
  const [rowHeight, setRowHeight] = useState(fallbackRowHeight);
  const observerRef = useRef<ResizeObserver | null>(null);
  const maxObservedRowHeightRef = useRef(0);

  const listRef = useCallback(
    (node: HTMLUListElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;

      const measureRows = () => {
        const rows = [...node.children];
        if (rows.length === 0) return;

        const tallestRowHeight = rows.reduce((height, row) => Math.max(height, row.getBoundingClientRect().height), 0);
        const measuredRowHeight = (round ? Math.ceil(tallestRowHeight) : tallestRowHeight) + safetyBuffer;
        maxObservedRowHeightRef.current = Math.max(maxObservedRowHeightRef.current, measuredRowHeight);
        const updateThreshold = round ? 1 : 0.25;
        setRowHeight((current) =>
          Math.abs(current - maxObservedRowHeightRef.current) > updateThreshold ? maxObservedRowHeightRef.current : current,
        );
      };

      measureRows();
      observerRef.current = new ResizeObserver(measureRows);
      observerRef.current.observe(node);
    },
    [round, safetyBuffer],
  );

  return { listRef, rowHeight };
}
