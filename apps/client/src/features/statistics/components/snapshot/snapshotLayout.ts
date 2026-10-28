import type { CSSProperties } from "react";

export type SnapshotChartMode = "page" | "export";
export type SnapshotLayout = {
  slotWidth: number;
  minSlots: number;
  barSize: number;
  barGap: number;
  margin: { top: number; left: number; right: number; bottom?: number };
  tickFontSize: number;
  valueFontSize: number;
  deltaFontSize: number;
  percentFontSize: number;
  deltaLineHeight: number;
  deltaLabelHeight: number;
  labelGap: number;
  conflictDistance: number;
  valueFill: string;
  halo: CSSProperties;
};
type PageGeometry = { layout: SnapshotLayout; isCompact: boolean; axisWidth: number; operatorLabelWidth: number | undefined };

export const COMPACT_FONT_SIZE = 10;
export const COMPACT_AXIS_TICK_MARGIN = 4;
const PAGE_VALUE_AXIS_WIDTH = 54;
const NORMAL_CATEGORY_GAP = 14;
const COMPACT_CATEGORY_GAP = 6;
const MIN_BAR_SIZE = 6;
const CHARACTER_WIDTH_RATIO = 0.62;

export const SNAPSHOT_LAYOUT: Record<SnapshotChartMode, SnapshotLayout> = {
  page: {
    slotWidth: 112,
    minSlots: 2.5,
    barSize: 28,
    barGap: 6,
    margin: { top: 20, left: 8, right: 8 },
    tickFontSize: 13,
    valueFontSize: 13,
    deltaFontSize: 12,
    percentFontSize: 11,
    deltaLineHeight: 13,
    deltaLabelHeight: 24,
    labelGap: 6,
    conflictDistance: 28,
    valueFill: "var(--foreground)",
    halo: { stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" },
  },
  export: {
    slotWidth: 90,
    minSlots: 1.5,
    barSize: 24,
    barGap: 10,
    margin: { top: 26, left: 6, right: 6, bottom: 0 },
    tickFontSize: 15,
    valueFontSize: 18,
    deltaFontSize: 15,
    percentFontSize: 13,
    deltaLineHeight: 15,
    deltaLabelHeight: 28,
    labelGap: 7,
    conflictDistance: 34,
    valueFill: "#fafafa",
    halo: { stroke: "#000000", strokeWidth: 4, strokeLinejoin: "round", paintOrder: "stroke" },
  },
};
const COMPACT_PAGE_LAYOUT = {
  barGap: 2,
  margin: { top: 20, left: 4, right: 4 },
  tickFontSize: COMPACT_FONT_SIZE,
  valueFontSize: COMPACT_FONT_SIZE,
  deltaFontSize: COMPACT_FONT_SIZE,
  percentFontSize: COMPACT_FONT_SIZE,
  deltaLineHeight: 11,
  deltaLabelHeight: 21,
  labelGap: 4,
  conflictDistance: 22,
} satisfies Partial<SnapshotLayout>;

export function getBandCellStyle(operatorCount: number, mode: SnapshotChartMode): CSSProperties {
  const { slotWidth, minSlots } = SNAPSHOT_LAYOUT[mode];
  const slots = Math.max(operatorCount, minSlots);
  return { flex: `${slots} 1 ${slots * slotWidth}px` };
}

function getNormalChartWidth(operatorCount: number): number {
  const { barSize, barGap, margin } = SNAPSHOT_LAYOUT.page;
  return operatorCount * (barSize * 2 + barGap + NORMAL_CATEGORY_GAP) + PAGE_VALUE_AXIS_WIDTH + margin.left + margin.right;
}

export function fitPageGeometry(chartWidth: number | null, operatorCount: number, compactAxisLabels: readonly string[]): PageGeometry {
  const page = SNAPSHOT_LAYOUT.page;
  if (chartWidth === null || chartWidth === 0 || chartWidth >= getNormalChartWidth(operatorCount)) {
    return { layout: page, isCompact: false, axisWidth: PAGE_VALUE_AXIS_WIDTH, operatorLabelWidth: undefined };
  }

  const longestAxisLabel = Math.max(0, ...compactAxisLabels.map((label) => label.length));
  const axisWidth = Math.min(
    PAGE_VALUE_AXIS_WIDTH,
    Math.ceil(longestAxisLabel * COMPACT_FONT_SIZE * CHARACTER_WIDTH_RATIO) + COMPACT_AXIS_TICK_MARGIN,
  );
  const { barGap, margin } = COMPACT_PAGE_LAYOUT;
  const operatorWidth = (chartWidth - axisWidth - margin.left - margin.right) / operatorCount;
  const barSize = Math.min(page.barSize, Math.max(MIN_BAR_SIZE, Math.floor((operatorWidth - barGap - COMPACT_CATEGORY_GAP) / 2)));
  return { layout: { ...page, ...COMPACT_PAGE_LAYOUT, barSize }, isCompact: true, axisWidth, operatorLabelWidth: operatorWidth };
}
