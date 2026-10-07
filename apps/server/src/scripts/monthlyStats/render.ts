import { getOperatorColor, getOperatorColorByName, resolveOperatorMnc } from "@openbts/shared/operatorUtils";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import type { StatsOperator } from "../../features/stats/schemas.ts";
import type { DatabaseMonthlyStats } from "./data.ts";
import {
  type Formatters,
  LOCALES,
  type Language,
  OPERATOR_METRICS,
  type OperatorMetricKey,
  compareBandNames,
  compareOperators,
  createFormatters,
  localizedMonth,
} from "./format.ts";

export const BAND_METRICS = ["cells", "stations"] as const;
export type BandMetric = (typeof BAND_METRICS)[number];

type PanelRow = { operator: StatsOperator; all: number; delta: number };
type Panel = { title: string; rows: PanelRow[]; deltaTotal: number | null };
type SizedPanel = Panel & { slots: number };
type Box = { x: number; y: number; width: number; height: number };
type Labels = {
  title: (month: string, year: string) => string;
  range: (from: string, to: string) => string;
  all: string;
  added: string;
  byOperator: string;
  byBand: Record<BandMetric, string>;
  metrics: Record<OperatorMetricKey, string>;
};

const WIDTH = 1920;
const SCALE = 2;
const PADDING_X = 48;
const PADDING_Y = 40;
const CONTENT_WIDTH = WIDTH - PADDING_X * 2;
const OPERATOR_LINE_HEIGHT = 250;
const BAND_LINE_HEIGHT = 218;
const OPERATOR_SLOT_WIDTH = 90;
const MIN_PANEL_SLOTS = 1.5;
const MAX_SLOTS_PER_LINE = (CONTENT_WIDTH - 1) / OPERATOR_SLOT_WIDTH;
const CAP_CENTER_RATIO = 0.35;

const HEADER = {
  height: 112,
  paddingBottom: 24,
  gap: 32,
  titleSize: 42,
  titleLineHeight: 52.5,
  subtitleSize: 18,
  subtitleLineHeight: 28,
  subtitleMargin: 4,
};
const HEADER_CENTER_Y = PADDING_Y + (HEADER.height - HEADER.paddingBottom) / 2;
const LOGO = { width: 185, height: 65, path: fileURLToPath(new URL("../../../../client/public/btsearch.webp", import.meta.url)) };
const LEGEND = { fontSize: 18, swatchWidth: 28, swatchHeight: 16, swatchGap: 12, itemGap: 32 };
const CAPTION = { fontSize: 15, marginTop: 20, marginBottom: 10 };
const PANEL = { paddingX: 12, paddingY: 10, titleSize: 22, titleLineHeight: 24, titleMargin: 4, titleGap: 12, titleSlack: 4 };
const CHART = {
  margin: { top: 26, left: 6, right: 6, bottom: 0 },
  xAxisHeight: 30,
  tickOffset: 14,
  tickFontSize: 15,
  tickCapHeight: 0.71,
  barSize: 24,
  barGap: 10,
  barRadius: 2,
  deltaMinPointSize: 3,
  valueLabelOffset: 5,
  valueFontSize: 18,
  deltaFontSize: 15,
  percentFontSize: 13,
  deltaLineHeight: 15,
  deltaLabelHeight: 28,
  labelGap: 7,
  conflictDistance: 34,
};
const COLORS = {
  background: "#000000",
  title: "#fafafa",
  panelTitle: "#ffffff",
  muted: "#a1a1aa",
  legend: "#d4d4d8",
  baseline: "#52525b",
  positive: "#34d399",
  line: "#ffffff",
};
const HALO = `stroke="${COLORS.background}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"`;
const FONT_FAMILIES = ["Nunito Sans", "Noto Sans", "sans-serif"];
const SVG_FONT_FAMILY = FONT_FAMILIES.map((family) => (family.includes(" ") ? `'${family}'` : family)).join(", ");
const PANGO_FONT_FAMILY = FONT_FAMILIES.join(",");
const LEGEND_HATCH_PATTERN = `<pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect x="3" width="1" height="4" fill="${COLORS.line}"/></pattern>`;

const LABELS: Record<Language, Labels> = {
  pl: {
    title: (month, year) => `Baza danych w miesiącu ${month} ${year}`,
    range: (from, to) => `Dane od ${from} do ${to}`,
    all: "Wszystkie",
    added: "Nowe",
    byOperator: "Wg operatora",
    byBand: { cells: "Komórki wg pasma", stations: "Stacje wg pasma" },
    metrics: { stations: "Stacje", cells: "Komórki", pcis: "PCI", azimuths: "Azymuty", networks_ids: "NetWorks ID", photos: "Zdjęcia" },
  },
  en: {
    title: (month, year) => `Database in ${month} ${year}`,
    range: (from, to) => `Data from ${from} to ${to}`,
    all: "All",
    added: "New",
    byOperator: "By operator",
    byBand: { cells: "Cells per band", stations: "Stations per band" },
    metrics: { stations: "Stations", cells: "Cells", pcis: "PCI", azimuths: "Azimuths", networks_ids: "NetWorks ID", photos: "Photos" },
  },
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function baselineIn(top: number, lineHeight: number, fontSize: number): number {
  return top + lineHeight / 2 + fontSize * CAP_CENTER_RATIO;
}

function svgText(content: string, x: number, y: number, attributes: string): string {
  return `<text x="${round(x)}" y="${round(y)}" ${attributes}>${escapeXml(content)}</text>`;
}

function svgLine(x1: number, y1: number, x2: number, y2: number, color: string, opacity = 1): string {
  return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${color}" stroke-opacity="${opacity}"/>`;
}

function svgRect(x: number, y: number, width: number, height: number, attributes: string): string {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" ${attributes}/>`;
}

function operatorColor(operator: StatsOperator): string {
  const mnc = resolveOperatorMnc(operator.mnc, operator.name);
  return mnc !== null ? getOperatorColor(mnc) : getOperatorColorByName(operator.name);
}

function hatchPatternId(color: string): string {
  return `hatch-${color.slice(1).toLowerCase()}`;
}

function renderHatchPattern(color: string): string {
  return `<pattern id="${hatchPatternId(color)}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${color}" fill-opacity="0.16"/><path d="M 0 0 L 0 6" stroke="${color}" stroke-width="2"/></pattern>`;
}

function buildOperatorPanels(stats: DatabaseMonthlyStats, labels: Labels): Panel[] {
  const rows = [...stats.operators].sort((a, b) => compareOperators(a.operator, b.operator));
  return OPERATOR_METRICS.flatMap((metric) => {
    const panelRows = rows
      .filter((row) => row[metric.key] > 0 || row[metric.added] > 0)
      .map((row) => ({ operator: row.operator, all: row[metric.key], delta: row[metric.added] }));
    const deltaTotal = metric.key === "photos" ? stats.photos.added : panelRows.reduce((sum, row) => sum + row.delta, 0);
    return panelRows.length > 0 ? [{ title: labels.metrics[metric.key], rows: panelRows, deltaTotal }] : [];
  });
}

function buildBandPanels(stats: DatabaseMonthlyStats, metric: BandMetric): Panel[] {
  const rowsByBand = new Map<string, PanelRow[]>();
  for (const row of stats.bands) {
    const rows = rowsByBand.get(row.band.name) ?? [];
    rows.push(
      metric === "cells"
        ? { operator: row.operator, all: row.cells, delta: row.cells_added }
        : { operator: row.operator, all: row.stations, delta: row.stations_added },
    );
    rowsByBand.set(row.band.name, rows);
  }
  return [...rowsByBand.entries()]
    .sort(([a], [b]) => compareBandNames(a, b))
    .map(([title, rows]) => ({ title, rows: rows.sort((a, b) => compareOperators(a.operator, b.operator)), deltaTotal: null }));
}

function deltaTotalLabel(panel: Panel, format: Formatters): string | null {
  return panel.deltaTotal !== null && panel.deltaTotal > 0 ? `+${format.number(panel.deltaTotal)}` : null;
}

async function sizePanels(panels: Panel[], format: Formatters): Promise<SizedPanel[]> {
  return Promise.all(
    panels.map(async (panel) => {
      const totalLabel = deltaTotalLabel(panel, format);
      const [titleWidth, totalWidth] = await Promise.all([
        measureTextWidth(panel.title, PANEL.titleSize, true),
        totalLabel === null ? 0 : measureTextWidth(totalLabel, PANEL.titleSize, true),
      ]);
      const headerWidth = titleWidth + (totalLabel === null ? 0 : PANEL.titleGap + totalWidth) + PANEL.paddingX * 2 + PANEL.titleSlack;
      const headerSlots = Math.ceil((headerWidth / OPERATOR_SLOT_WIDTH) * 2) / 2;
      return { ...panel, slots: Math.max(panel.rows.length, MIN_PANEL_SLOTS, headerSlots) };
    }),
  );
}

function sumSlots(panels: readonly SizedPanel[]): number {
  return panels.reduce((sum, panel) => sum + panel.slots, 0);
}

function packLines(panels: SizedPanel[], capacity: number): SizedPanel[][] {
  const lines: SizedPanel[][] = [];
  let line: SizedPanel[] = [];
  let lineSlots = 0;
  for (const panel of panels) {
    if (line.length > 0 && lineSlots + panel.slots > capacity) {
      lines.push(line);
      line = [];
      lineSlots = 0;
    }
    line.push(panel);
    lineSlots += panel.slots;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function balanceLines(panels: SizedPanel[]): SizedPanel[][] {
  if (panels.length === 0) return [];
  const lineCount = packLines(panels, MAX_SLOTS_PER_LINE).length;
  let capacity = Math.max(sumSlots(panels) / lineCount, ...panels.map((panel) => panel.slots));
  let lines = packLines(panels, capacity);
  while (lines.length > lineCount) {
    capacity += 0.5;
    lines = packLines(panels, capacity);
  }
  return lines;
}

function gridHeight(lines: SizedPanel[][], lineHeight: number): number {
  return 1 + lines.length * lineHeight;
}

function layoutLines(lines: SizedPanel[][], top: number, lineHeight: number): { panel: SizedPanel; box: Box }[] {
  const innerX = PADDING_X + 1;
  const innerWidth = CONTENT_WIDTH - 1;
  return lines.flatMap((line, lineIndex) => {
    const totalSlots = sumSlots(line);
    let slotsBefore = 0;
    return line.map((panel) => {
      const left = Math.round(innerX + (innerWidth * slotsBefore) / totalSlots);
      slotsBefore += panel.slots;
      const right = Math.round(innerX + (innerWidth * slotsBefore) / totalSlots);
      return { panel, box: { x: left, y: top + 1 + lineIndex * lineHeight, width: right - left, height: lineHeight } };
    });
  });
}

function renderChart(rows: PanelRow[], chart: Box, format: Formatters): string {
  const plotLeft = chart.x + CHART.margin.left;
  const plotRight = chart.x + chart.width - CHART.margin.right;
  const plotTop = chart.y + CHART.margin.top;
  const plotBottom = chart.y + chart.height - CHART.margin.bottom - CHART.xAxisHeight;
  const plotHeight = Math.max(0, plotBottom - plotTop);
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.all, row.delta]));
  const valueTop = (value: number) => plotBottom - (value / maxValue) * plotHeight;
  const bandWidth = (plotRight - plotLeft) / rows.length;
  const barMarkup = [svgLine(plotLeft, plotBottom, plotRight, plotBottom, COLORS.baseline)];
  const labelMarkup: string[] = [];

  for (const [index, row] of rows.entries()) {
    const color = operatorColor(row.operator);
    const bandLeft = plotLeft + index * bandWidth;
    const allX = bandLeft + Math.trunc((bandWidth - CHART.barSize * 2 - CHART.barGap) / 2);
    const deltaX = allX + CHART.barSize + CHART.barGap;
    const allTop = valueTop(row.all);
    const deltaTop = row.delta > 0 ? Math.min(valueTop(row.delta), plotBottom - CHART.deltaMinPointSize) : plotBottom;
    const hasDeltaLabel = row.delta > 0 && row.all > 0;
    const hasConflict = hasDeltaLabel && deltaTop - allTop < CHART.conflictDistance;

    if (row.all > 0) barMarkup.push(svgRect(allX, allTop, CHART.barSize, plotBottom - allTop, `rx="${CHART.barRadius}" fill="${color}"`));
    if (row.delta > 0)
      barMarkup.push(
        svgRect(
          deltaX,
          deltaTop,
          CHART.barSize,
          plotBottom - deltaTop,
          `rx="${CHART.barRadius}" fill="url(#${hatchPatternId(color)})" stroke="${color}"`,
        ),
      );

    labelMarkup.push(
      svgText(
        format.number(row.all),
        hasConflict ? allX + CHART.barSize : allX + CHART.barSize / 2,
        allTop - CHART.valueLabelOffset,
        `text-anchor="${hasConflict ? "end" : "middle"}" font-size="${CHART.valueFontSize}" font-weight="600" fill="${COLORS.title}" ${HALO}`,
      ),
    );
    if (hasDeltaLabel) {
      const percentY = Math.max(chart.y + CHART.deltaLabelHeight, deltaTop - CHART.labelGap);
      const labelX = round(hasConflict ? deltaX : deltaX + CHART.barSize / 2);
      labelMarkup.push(
        `<text text-anchor="${hasConflict ? "start" : "middle"}" fill="${COLORS.positive}" ${HALO}>` +
          `<tspan x="${labelX}" y="${round(percentY - CHART.deltaLineHeight)}" font-size="${CHART.deltaFontSize}" font-weight="600">${escapeXml(format.number(row.delta))}</tspan>` +
          `<tspan x="${labelX}" y="${round(percentY)}" font-size="${CHART.percentFontSize}">${escapeXml(format.percent((row.delta / row.all) * 100))}</tspan>` +
          "</text>",
      );
    }
    labelMarkup.push(
      svgText(
        row.operator.name,
        bandLeft + bandWidth / 2,
        plotBottom + CHART.tickOffset + CHART.tickFontSize * CHART.tickCapHeight,
        `text-anchor="middle" font-size="${CHART.tickFontSize}" fill="${COLORS.muted}"`,
      ),
    );
  }

  return barMarkup.join("") + labelMarkup.join("");
}

function renderPanel(panel: Panel, box: Box, clipId: string, format: Formatters): string {
  const content = {
    x: box.x + PANEL.paddingX,
    y: box.y + PANEL.paddingY,
    width: box.width - 1 - PANEL.paddingX * 2,
    height: box.height - 1 - PANEL.paddingY * 2,
  };
  const titleY = baselineIn(content.y, PANEL.titleLineHeight, PANEL.titleSize);
  const chartTop = content.y + PANEL.titleLineHeight + PANEL.titleMargin;
  const titleAttributes = `font-size="${PANEL.titleSize}" font-weight="600"`;
  const totalLabel = deltaTotalLabel(panel, format);

  return [
    `<clipPath id="${clipId}">${svgRect(box.x, box.y, box.width - 1, box.height - 1, "")}</clipPath>`,
    `<g clip-path="url(#${clipId})">`,
    svgText(panel.title, content.x, titleY, `${titleAttributes} fill="${COLORS.panelTitle}"`),
    totalLabel === null
      ? ""
      : svgText(totalLabel, content.x + content.width, titleY, `${titleAttributes} text-anchor="end" fill="${COLORS.positive}"`),
    renderChart(panel.rows, { x: content.x, y: chartTop, width: content.width, height: content.y + content.height - chartTop }, format),
    "</g>",
    svgLine(box.x + box.width - 0.5, box.y, box.x + box.width - 0.5, box.y + box.height, COLORS.line, 0.15),
    svgLine(box.x, box.y + box.height - 0.5, box.x + box.width, box.y + box.height - 0.5, COLORS.line, 0.15),
  ].join("");
}

function renderPanelGrid(lines: SizedPanel[][], top: number, lineHeight: number, idPrefix: string, format: Formatters): string {
  return [
    svgLine(PADDING_X, top + 0.5, PADDING_X + CONTENT_WIDTH, top + 0.5, COLORS.line, 0.15),
    svgLine(PADDING_X + 0.5, top, PADDING_X + 0.5, top + gridHeight(lines, lineHeight), COLORS.line, 0.15),
    ...layoutLines(lines, top, lineHeight).map((placed, index) => renderPanel(placed.panel, placed.box, `${idPrefix}-${index}`, format)),
  ].join("");
}

function renderHeader(title: string, subtitle: string, labels: Labels, legendWidths: { all: number; added: number }): string {
  const dividerX = PADDING_X + LOGO.width + HEADER.gap;
  const textX = dividerX + 1 + HEADER.gap;
  const blockHeight = HEADER.titleLineHeight + HEADER.subtitleMargin + HEADER.subtitleLineHeight;
  const blockTop = HEADER_CENTER_Y - blockHeight / 2;
  const subtitleTop = blockTop + HEADER.titleLineHeight + HEADER.subtitleMargin;
  const addedTextX = WIDTH - PADDING_X - legendWidths.added;
  const addedSwatchX = addedTextX - LEGEND.swatchGap - LEGEND.swatchWidth;
  const allTextX = addedSwatchX - LEGEND.itemGap - legendWidths.all;
  const allSwatchX = allTextX - LEGEND.swatchGap - LEGEND.swatchWidth;
  const swatchY = HEADER_CENTER_Y - LEGEND.swatchHeight / 2;
  const legendY = HEADER_CENTER_Y + LEGEND.fontSize * CAP_CENTER_RATIO;
  const legendAttributes = `font-size="${LEGEND.fontSize}" fill="${COLORS.legend}"`;
  const headerBottom = PADDING_Y + HEADER.height;

  return [
    svgLine(dividerX + 0.5, blockTop, dividerX + 0.5, blockTop + blockHeight, COLORS.line, 0.2),
    svgText(
      title,
      textX,
      baselineIn(blockTop, HEADER.titleLineHeight, HEADER.titleSize),
      `font-size="${HEADER.titleSize}" font-weight="600" letter-spacing="${round(HEADER.titleSize * -0.02)}" fill="${COLORS.title}"`,
    ),
    svgText(
      subtitle,
      textX,
      baselineIn(subtitleTop, HEADER.subtitleLineHeight, HEADER.subtitleSize),
      `font-size="${HEADER.subtitleSize}" fill="${COLORS.muted}"`,
    ),
    svgRect(allSwatchX, swatchY, LEGEND.swatchWidth, LEGEND.swatchHeight, `fill="${COLORS.line}"`),
    svgText(labels.all, allTextX, legendY, legendAttributes),
    svgRect(addedSwatchX + 0.5, swatchY + 0.5, LEGEND.swatchWidth - 1, LEGEND.swatchHeight - 1, `fill="url(#legend-hatch)" stroke="${COLORS.line}"`),
    svgText(labels.added, addedTextX, legendY, legendAttributes),
    svgLine(PADDING_X, headerBottom - 0.5, WIDTH - PADDING_X, headerBottom - 0.5, COLORS.line, 0.2),
  ].join("");
}

function renderCaption(content: string, top: number, locale: string): string {
  return svgText(
    content.toLocaleUpperCase(locale),
    PADDING_X,
    baselineIn(top, CAPTION.fontSize, CAPTION.fontSize),
    `font-size="${CAPTION.fontSize}" font-weight="600" letter-spacing="${round(CAPTION.fontSize * 0.12)}" fill="${COLORS.muted}"`,
  );
}

async function measureTextWidth(content: string, fontSize: number, semibold = false): Promise<number> {
  const font = `${PANGO_FONT_FAMILY}${semibold ? " Semi-Bold" : ""} ${fontSize}`;
  const { info } = await sharp({ text: { text: escapeXml(content), font, dpi: 72 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return info.width;
}

async function loadWhiteLogo(): Promise<Buffer> {
  const { data, info } = await sharp(LOGO.path)
    .resize(LOGO.width * SCALE, LOGO.height * SCALE)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: info.width, height: info.height, channels: 3, background: COLORS.line } })
    .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

export async function renderMonthlyStatsImage(stats: DatabaseMonthlyStats, month: string, metric: BandMetric, language: Language): Promise<Buffer> {
  const labels = LABELS[language];
  const format = createFormatters(language);
  const [allWidth, addedWidth, logo, operatorPanels, bandPanels] = await Promise.all([
    measureTextWidth(labels.all, LEGEND.fontSize),
    measureTextWidth(labels.added, LEGEND.fontSize),
    loadWhiteLogo(),
    sizePanels(buildOperatorPanels(stats, labels), format),
    sizePanels(buildBandPanels(stats, metric), format),
  ]);
  const monthLabel = localizedMonth(month, language);
  const title = labels.title(monthLabel.month, monthLabel.year);
  const subtitle = stats.from !== null && stats.to !== null ? labels.range(stats.from, stats.to) : "";
  const operatorLines = balanceLines(operatorPanels);
  const bandLines = balanceLines(bandPanels);
  const operatorCaptionTop = PADDING_Y + HEADER.height + CAPTION.marginTop;
  const operatorGridTop = operatorCaptionTop + CAPTION.fontSize + CAPTION.marginBottom;
  const bandCaptionTop = operatorGridTop + gridHeight(operatorLines, OPERATOR_LINE_HEIGHT) + CAPTION.marginTop;
  const bandGridTop = bandCaptionTop + CAPTION.fontSize + CAPTION.marginBottom;
  const height = bandGridTop + gridHeight(bandLines, BAND_LINE_HEIGHT) + PADDING_Y;
  const colors = new Set([...stats.operators, ...stats.bands].map((row) => operatorColor(row.operator)));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${height * SCALE}" viewBox="0 0 ${WIDTH} ${height}">`,
    `<defs>${LEGEND_HATCH_PATTERN}${[...colors].map((color) => renderHatchPattern(color)).join("")}</defs>`,
    svgRect(0, 0, WIDTH, height, `fill="${COLORS.background}"`),
    `<g font-family="${SVG_FONT_FAMILY}">`,
    renderHeader(title, subtitle, labels, { all: allWidth, added: addedWidth }),
    renderCaption(labels.byOperator, operatorCaptionTop, LOCALES[language]),
    renderPanelGrid(operatorLines, operatorGridTop, OPERATOR_LINE_HEIGHT, "operator", format),
    renderCaption(labels.byBand[metric], bandCaptionTop, LOCALES[language]),
    renderPanelGrid(bandLines, bandGridTop, BAND_LINE_HEIGHT, "band", format),
    "</g>",
    "</svg>",
  ].join("");

  return sharp(Buffer.from(svg))
    .composite([{ input: logo, left: PADDING_X * SCALE, top: Math.round((HEADER_CENTER_Y - LOGO.height / 2) * SCALE) }])
    .png()
    .toBuffer();
}
