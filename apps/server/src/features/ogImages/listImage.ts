import { SEO_IMAGE_HEIGHT, SEO_IMAGE_WIDTH, microwaveLinksNoun, polishPlural, stationsNoun } from "@openbts/shared/seo";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { escapeHtml } from "../../lib/html.js";
import type { OGListRenderRequest } from "./contract.js";

const PADDING_X = 56;
const CONTENT_WIDTH = SEO_IMAGE_WIDTH - PADDING_X * 2;
const FONT_FAMILY = "Noto Sans";
const BACKGROUND_COLOR = "#0c0c0c";
const TEXT_COLOR = "#ffffff";
const MUTED_TEXT_COLOR = "#cdd3d8";
const OTHER_OPERATORS_COLOR = "#555b5d";
const ELLIPSIS = "...";
const NAME_TOP = 44;
const NAME_FONT_SIZE = 56;
const NAME_LINE_HEIGHT = 66;
const NAME_BASELINE = 55;
const OWNER_TOP_GAP = 8;
const OWNER_BASELINE = 32;
const TEXT_FONT_SIZE = 30;
const TOTAL_FONT_SIZE = 40;
const TOTALS_HEIGHT = 48;
const TOTALS_BASELINE = 40;
const TOTALS_GAP = 40;
const TOTAL_NOUN_GAP = 12;
const CHART_BOTTOM = 502;
const BAR_HEIGHT = 44;
const BAR_TOP_GAP = 14;
const BAR_SEGMENT_GAP = 6;
const LEGEND_TOP_GAP = 20;
const LEGEND_ROW_HEIGHT = 44;
const LEGEND_ROW_GAP = 8;
const LEGEND_ITEM_GAP = 36;
const LEGEND_PART_GAP = 12;
const LEGEND_BASELINE = 34;
const LEGEND_NAME_MAX_WIDTH = 300;
const LOGO_HEIGHT = 36;
const LOGO_MAX_WIDTH = 108;
const LOGO_RADIUS = 5;
const LOGO_MAX_INPUT_PIXELS = 768 * 128;
const SWATCH_SIZE = 23;
const SWATCH_RADIUS = 7;
const SITE_LOGO_BOTTOM = 36;
const VIEW_BOX_PATTERN = /<svg\b[^>]*?\sviewBox="([^"]*)"/;

export type ListImageContext = {
  siteLogo: { buffer: Buffer; height: number };
  uploadsPath: string;
  timeoutSeconds: () => number;
};

type MeasureText = (text: string, fontSize: number, bold: boolean) => Promise<number>;
type MeasureWidth = (text: string) => Promise<number>;
type BrandLogo = { buffer: Buffer; width: number; height: number };
type LegendEntry = OGListRenderRequest["operators"][number];
type LegendItem = { logo: BrandLogo | null; color: string; name: string; nameWidth: number; count: string; width: number };
type PlacedLegendItem = LegendItem & { left: number; row: number };

function createTextMeasurer(timeoutSeconds: () => number): MeasureText {
  return async (text, fontSize, bold) => {
    const font = `${FONT_FAMILY}${bold ? " Bold" : ""} ${fontSize}`;
    const { info } = await sharp({ text: { text: escapeHtml(text), font, dpi: 72 } })
      .png()
      .timeout({ seconds: timeoutSeconds() })
      .toBuffer({ resolveWithObject: true });
    return info.width;
  };
}

async function longestFittingLength(low: number, high: number, fits: (length: number) => Promise<boolean>): Promise<number> {
  if (low >= high) return low;
  const middle = Math.ceil((low + high) / 2);
  if (await fits(middle)) return longestFittingLength(middle, high, fits);
  return longestFittingLength(low, middle - 1, fits);
}

async function shortenToWidth(text: string, maxWidth: number, measure: MeasureWidth): Promise<string> {
  if ((await measure(text)) <= maxWidth) return text;

  const characters = [...text];
  const shorten = (length: number) => `${characters.slice(0, length).join("").trimEnd()}${ELLIPSIS}`;
  return shorten(await longestFittingLength(0, characters.length, async (length) => (await measure(shorten(length))) <= maxWidth));
}

async function splitNameLines(name: string, measure: MeasureWidth): Promise<string[]> {
  if ((await measure(name)) <= CONTENT_WIDTH) return [name];

  const characters = [...name];
  const prefix = (length: number) => characters.slice(0, length).join("");
  const fittingLength = await longestFittingLength(0, characters.length, async (length) => (await measure(prefix(length))) <= CONTENT_WIDTH);
  const fitting = prefix(fittingLength);
  const wordBreak = fitting.lastIndexOf(" ");
  const firstLine = wordBreak > 0 && characters[fittingLength] !== " " ? fitting.slice(0, wordBreak) : fitting.trimEnd();
  return [firstLine, await shortenToWidth(name.slice(firstLine.length).trimStart(), CONTENT_WIDTH, measure)];
}

function sizeVectorLogo(file: Buffer): Buffer {
  const source = file.toString("utf8");
  const viewBox = VIEW_BOX_PATTERN.exec(source)?.[1] ?? "";
  const [, , width = 0, height = 0] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!(width > 0 && height > 0)) throw new Error("Brand logo has no viewBox size");

  const scale = Math.min(LOGO_MAX_WIDTH / width, LOGO_HEIGHT / height);
  const size = `width="${Math.max(1, Math.round(width * scale))}" height="${Math.max(1, Math.round(height * scale))}"`;
  return Buffer.from(source.replace("<svg", `<svg ${size}`));
}

async function loadBrandLogo(logoFile: string, context: ListImageContext): Promise<BrandLogo | null> {
  try {
    const file = await readFile(join(context.uploadsPath, logoFile));
    const { data, info } = await sharp(logoFile.endsWith(".svg") ? sizeVectorLogo(file) : file, { limitInputPixels: LOGO_MAX_INPUT_PIXELS })
      .resize({ width: LOGO_MAX_WIDTH, height: LOGO_HEIGHT, fit: "inside" })
      .png()
      .timeout({ seconds: context.timeoutSeconds() })
      .toBuffer({ resolveWithObject: true });
    const corners = Buffer.from(
      `<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${info.width}" height="${info.height}" rx="${LOGO_RADIUS}"/>
      </svg>`,
    );
    const buffer = await sharp(data)
      .composite([{ input: corners, blend: "dest-in" }])
      .png()
      .timeout({ seconds: context.timeoutSeconds() })
      .toBuffer();
    return { buffer, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

function listLegendEntries(request: OGListRenderRequest): LegendEntry[] {
  const { operators, otherOperators } = request;
  if (otherOperators === null) return operators;

  const name = `+${otherOperators.count} ${polishPlural(otherOperators.count, "inny", "inne", "innych")}`;
  return [...operators, { name, count: otherOperators.stationCount, color: OTHER_OPERATORS_COLOR, logoFile: null }];
}

async function createLegendItem(entry: LegendEntry, context: ListImageContext, measure: MeasureText): Promise<LegendItem> {
  const count = String(entry.count);
  const measureName: MeasureWidth = (text) => measure(text, TEXT_FONT_SIZE, true);
  const [logo, name, countWidth] = await Promise.all([
    entry.logoFile === null ? null : loadBrandLogo(entry.logoFile, context),
    shortenToWidth(entry.name, LEGEND_NAME_MAX_WIDTH, measureName),
    measure(count, TEXT_FONT_SIZE, false),
  ]);
  const nameWidth = await measureName(name);
  const width = (logo?.width ?? SWATCH_SIZE) + LEGEND_PART_GAP + nameWidth + LEGEND_PART_GAP + countWidth;

  return { logo, color: entry.color, name, nameWidth, count, width };
}

function placeLegendItems(items: readonly LegendItem[]): PlacedLegendItem[] {
  let left = 0;
  let row = 0;

  return items.map((item) => {
    if (left > 0 && left + item.width > CONTENT_WIDTH) {
      left = 0;
      row += 1;
    }
    const placed = { ...item, left: PADDING_X + left, row };
    left += item.width + LEGEND_ITEM_GAP;
    return placed;
  });
}

function textSvg(left: number, baseline: number, fontSize: number, color: string, content: string, bold = false): string {
  return `<text x="${left}" y="${baseline}" font-size="${fontSize}"${bold ? ' font-weight="700"' : ""} fill="${color}">${content}</text>`;
}

function nameSvg(lines: readonly string[]): string {
  return lines
    .map((line, index) => textSvg(PADDING_X, NAME_TOP + NAME_BASELINE + index * NAME_LINE_HEIGHT, NAME_FONT_SIZE, TEXT_COLOR, escapeHtml(line), true))
    .join("");
}

function ownerSvg(username: string, top: number): string {
  const owner = `<tspan font-weight="700" fill="${TEXT_COLOR}">@${escapeHtml(username)}</tspan>`;
  return textSvg(PADDING_X, top + OWNER_BASELINE, TEXT_FONT_SIZE, MUTED_TEXT_COLOR, `Lista użytkownika ${owner}`);
}

function totalsSvg(request: OGListRenderRequest, top: number): string {
  const baseline = top + TOTALS_BASELINE;
  const totals = [
    { count: request.stationCount, noun: stationsNoun(request.stationCount) },
    { count: request.microwaveLinkCount, noun: microwaveLinksNoun(request.microwaveLinkCount) },
  ].filter((total) => total.count > 0);
  if (totals.length === 0) return textSvg(PADDING_X, baseline, TOTAL_FONT_SIZE, MUTED_TEXT_COLOR, "Lista jest pusta", true);

  const spans = totals.map((total, index) => {
    const offset = index > 0 ? ` dx="${TOTALS_GAP}"` : "";
    const count = `<tspan${offset} font-size="${TOTAL_FONT_SIZE}" font-weight="700" fill="${TEXT_COLOR}">${total.count}</tspan>`;
    return `${count}<tspan dx="${TOTAL_NOUN_GAP}">${total.noun}</tspan>`;
  });
  return textSvg(PADDING_X, baseline, TEXT_FONT_SIZE, MUTED_TEXT_COLOR, spans.join(""));
}

function barSvg(entries: readonly LegendEntry[], top: number): string {
  const stationCount = entries.reduce((total, entry) => total + entry.count, 0);
  const segmentsWidth = CONTENT_WIDTH - BAR_SEGMENT_GAP * (entries.length - 1);
  let left = PADDING_X;
  const segments = entries
    .map((entry) => {
      const width = (segmentsWidth * entry.count) / stationCount;
      const segment = `<rect x="${left.toFixed(2)}" y="${top}" width="${width.toFixed(2)}" height="${BAR_HEIGHT}" fill="${entry.color}"/>`;
      left += width + BAR_SEGMENT_GAP;
      return segment;
    })
    .join("");

  return `<defs><clipPath id="bar"><rect x="${PADDING_X}" y="${top}" width="${CONTENT_WIDTH}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}"/></clipPath></defs>
    <g clip-path="url(#bar)">${segments}</g>`;
}

function legendItemSvg(item: PlacedLegendItem, top: number): string {
  const nameLeft = item.left + (item.logo?.width ?? SWATCH_SIZE) + LEGEND_PART_GAP;
  const baseline = top + LEGEND_BASELINE;
  const swatchTop = top + (LEGEND_ROW_HEIGHT - SWATCH_SIZE) / 2;
  const swatch = item.logo
    ? ""
    : `<rect x="${item.left}" y="${swatchTop}" width="${SWATCH_SIZE}" height="${SWATCH_SIZE}" rx="${SWATCH_RADIUS}" fill="${item.color}"/>`;
  const name = textSvg(nameLeft, baseline, TEXT_FONT_SIZE, TEXT_COLOR, escapeHtml(item.name), true);
  const count = textSvg(nameLeft + item.nameWidth + LEGEND_PART_GAP, baseline, TEXT_FONT_SIZE, MUTED_TEXT_COLOR, item.count);
  return `${swatch}${name}${count}`;
}

export async function renderListImage(request: OGListRenderRequest, context: ListImageContext): Promise<Buffer> {
  const measure = createTextMeasurer(context.timeoutSeconds);
  const entries = listLegendEntries(request);
  const [nameLines, items] = await Promise.all([
    splitNameLines(request.name.replace(/\s+/g, " ").trim(), (text) => measure(text, NAME_FONT_SIZE, true)),
    Promise.all(entries.map((entry) => createLegendItem(entry, context, measure))),
  ]);
  const legend = placeLegendItems(items);
  const legendRows = (legend.at(-1)?.row ?? 0) + 1;
  const legendTop = CHART_BOTTOM - legendRows * LEGEND_ROW_HEIGHT - (legendRows - 1) * LEGEND_ROW_GAP;
  const legendRowTop = (row: number) => legendTop + row * (LEGEND_ROW_HEIGHT + LEGEND_ROW_GAP);
  const barTop = legendTop - LEGEND_TOP_GAP - BAR_HEIGHT;
  const hasChart = entries.length > 0;
  const totalsTop = (hasChart ? barTop - BAR_TOP_GAP : CHART_BOTTOM) - TOTALS_HEIGHT;
  const ownerTop = NAME_TOP + nameLines.length * NAME_LINE_HEIGHT + OWNER_TOP_GAP;

  const card = Buffer.from(
    `<svg width="${SEO_IMAGE_WIDTH}" height="${SEO_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT_FAMILY}, sans-serif">
      <rect width="${SEO_IMAGE_WIDTH}" height="${SEO_IMAGE_HEIGHT}" fill="${BACKGROUND_COLOR}"/>
      ${nameSvg(nameLines)}
      ${request.ownerUsername === null ? "" : ownerSvg(request.ownerUsername, ownerTop)}
      ${totalsSvg(request, totalsTop)}
      ${hasChart ? barSvg(entries, barTop) : ""}
      ${legend.map((item) => legendItemSvg(item, legendRowTop(item.row))).join("")}
    </svg>`,
  );
  const brandLogos = legend.flatMap((item) =>
    item.logo
      ? [{ input: item.logo.buffer, left: item.left, top: Math.round(legendRowTop(item.row) + (LEGEND_ROW_HEIGHT - item.logo.height) / 2) }]
      : [],
  );

  return sharp(card)
    .composite([
      ...brandLogos,
      { input: context.siteLogo.buffer, left: PADDING_X, top: SEO_IMAGE_HEIGHT - SITE_LOGO_BOTTOM - context.siteLogo.height },
    ])
    .png()
    .timeout({ seconds: context.timeoutSeconds() })
    .toBuffer();
}
