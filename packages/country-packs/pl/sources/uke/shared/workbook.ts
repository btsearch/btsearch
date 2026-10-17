import type { LocalFile } from "../../../../core/sources.ts";
import { type ZipArchive, type ZipEntry, findZipEntry, inflateZipEntry, openZip, readZipEntry } from "./zip.ts";

type CellValue = number | string | boolean | undefined;
export type SheetCell = { type: "n" | "s" | "b" | "e"; value: CellValue; text: string };
export type SheetCells = (SheetCell | undefined)[];
export type RowWidth = { lastColumn: number };

type SheetRange = { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number };
type CellTag = { reference: string | undefined; style: string | undefined; type: string | undefined };
type PlacedCell = { row: number; column: number; cell: SheetCell | undefined };
type ParsedRow = { rowNumber: number; cells: PlacedCell[] };
type WorkbookStyles = { formatIdByStyle: ReadonlyMap<string, number | undefined> | undefined; customFormats: ReadonlyMap<number, string> };
type WorkbookContext = {
  fileName: string;
  sharedStrings: readonly (string | undefined)[];
  styles: WorkbookStyles;
  format: (format: string | number, value: unknown) => string;
};

const TAG = /<[/?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?>/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s=]+))*\s*[/?]?>/gm;
const ATTRIBUTE = /([^"\s?>/]+)\s*=\s*((?:")([^"]*)(?:")|(?:')([^']*)(?:')|([^'">\s]+))/g;
const NAMESPACE_PREFIX = /<(\/?)\w+:/;
const ENTITY = /&(?:quot|apos|gt|lt|amp|#x?([\da-fA-F]+));/gi;
const ESCAPED_CHARACTER = /_x([\da-fA-F]{4})_/gi;
const ENTITY_TEXTS: Readonly<Record<string, string>> = { "&quot;": '"', "&apos;": "'", "&gt;": ">", "&lt;": "<", "&amp;": "&" };

const SHARED_STRINGS = /<(?:\w+:)?sst([^>]*)>([\s\S]*)<\/(?:\w+:)?sst>/;
const STRING_ITEM_START = /<(?:\w+:)?(?:si|sstItem)>/g;
const STRING_ITEM_END = /<\/(?:\w+:)?(?:si|sstItem)>/;
const PLAIN_TEXT_START = /^\s*<(?:\w+:)?t[^>]*>/;
const TEXT_END = /<\/(?:\w+:)?t>/;
const RICH_TEXT_RUN = /<(?:\w+:)?r>/;
const PHONETIC_RUN = /<(?:\w+:)?rPh.*?>([\s\S]*?)<\/(?:\w+:)?rPh>/g;
const TEXT_ELEMENT = /<(?:\w+:)?t[^>]*>([^<]*)<\/(?:\w+:)?t>/g;

const STYLE_COMMENT = /<!--([\s\S]*?)-->/gm;
const STYLE_DOCTYPE = /<!DOCTYPE[^[]*\[[^\]]*\]>/gm;
const NUMBER_FORMATS = /<(?:\w+:)?numFmts([^>]*)>[\S\s]*?<\/(?:\w+:)?numFmts>/;
const CELL_FORMATS = /<(?:\w+:)?cellXfs([^>]*)>[\S\s]*?<\/(?:\w+:)?cellXfs>/;

const SHEET_DATA_START = /<(?:\w+:)?sheetData[^>]*>/;
const SHEET_DATA_END = /<\/(?:\w+:)?sheetData>/;
const DIMENSION = /<(?:\w*:)?dimension/;
const DIMENSION_RANGE = /"(\w*:\w*)"/;
const CELL_VALUE = /<(?:\w+:)?v(?: xml:space="preserve")?(?:[^>]*)>([\s\S]*?)<\/(?:\w+:)?v>/;
const INLINE_STRING = /<(?:\w+:)?is>([\S\s]*?)<\/(?:\w+:)?is>/;

const RANGE_GUESS_START = 2_000_000;
const ERROR_CODES = new Map([
  ["#NULL!", 0x00],
  ["#DIV/0!", 0x07],
  ["#VALUE!", 0x0f],
  ["#REF!", 0x17],
  ["#NAME?", 0x1d],
  ["#NUM!", 0x24],
  ["#N/A", 0x2a],
  ["#GETTING_DATA", 0x2b],
  ["#WTF?", 0xff],
]);
const SHEETJS_IMPLICIT_FORMATS = new Map([
  [5, '"$"#,##0_);\\("$"#,##0\\)'],
  [6, '"$"#,##0_);[Red]\\("$"#,##0\\)'],
  [7, '"$"#,##0.00_);\\("$"#,##0.00\\)'],
  [8, '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)'],
  [32, "h:mm:ss"],
  [33, "h:mm:ss"],
  [34, "h:mm:ss"],
  [35, "h:mm:ss"],
  [36, "m/d/yy"],
  [41, '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)'],
  [42, '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)'],
  [43, '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)'],
  [44, '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)'],
]);

function decodeUtf8(binary: string): string {
  return Buffer.from(binary, "latin1").toString("utf8");
}

function unescapeXml(text: string): string {
  const cdataStart = text.indexOf("<![CDATA[");
  if (cdataStart === -1) {
    if (!text.includes("&") && !text.includes("_")) return text;
    return text
      .replace(ENTITY, (entity: string, code: string | undefined) => {
        return ENTITY_TEXTS[entity] || String.fromCharCode(Number.parseInt(code ?? "", entity.includes("x") ? 16 : 10)) || entity;
      })
      .replace(ESCAPED_CHARACTER, (_: string, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
  }

  const cdataEnd = text.indexOf("]]>");
  return unescapeXml(text.slice(0, cdataStart)) + text.slice(cdataStart + 9, cdataEnd) + unescapeXml(text.slice(cdataEnd + 3));
}

function tagNameEnd(tag: string): number {
  const end = tag.search(/[ \n\r]/);
  return end === -1 ? tag.length : end;
}

function tagName(tag: string): string {
  return tag.slice(0, tagNameEnd(tag)).replace(NAMESPACE_PREFIX, "<$1");
}

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  if (tagNameEnd(tag) === tag.length) return attributes;

  for (const attribute of tag.match(ATTRIBUTE) ?? []) {
    let equals = attribute.indexOf("=");
    const qualifiedName = attribute.slice(0, equals).trim();
    while (attribute.charCodeAt(equals + 1) === 32) equals++;
    const quote = attribute.charCodeAt(equals + 1);
    const quoted = quote === 34 || quote === 39 ? 1 : 0;
    const value = attribute.slice(equals + 1 + quoted, attribute.length - quoted);
    const colon = qualifiedName.indexOf(":");
    const underscore = qualifiedName.indexOf("_");
    let name = underscore > 0 ? qualifiedName.slice(0, underscore) : qualifiedName;
    if (colon !== -1) {
      name = (colon === 5 && qualifiedName.startsWith("xmlns") ? "xmlns" : "") + qualifiedName.slice(colon + 1);
      if (attributes.get(name) && qualifiedName.slice(colon - 3, colon) === "ext") continue;
    }
    attributes.set(name, value);
    attributes.set(name.toLowerCase(), value);
  }

  return attributes;
}

function readStringItem(xml: string): string | undefined {
  if (!xml) return "";
  if (PLAIN_TEXT_START.test(xml)) return unescapeXml(decodeUtf8(xml.slice(xml.indexOf(">") + 1).split(TEXT_END)[0] ?? ""));
  if (!RICH_TEXT_RUN.test(xml)) return undefined;

  return unescapeXml(decodeUtf8((xml.replace(PHONETIC_RUN, "").match(TEXT_ELEMENT) ?? []).join("").replace(TAG, "")));
}

function readSharedStrings(xml: string | undefined): (string | undefined)[] {
  const table = xml === undefined ? null : SHARED_STRINGS.exec(xml);
  if (table === null) return [];

  return (table[2] ?? "")
    .replace(STRING_ITEM_START, "")
    .split(STRING_ITEM_END)
    .map((item) => readStringItem(item.trim()));
}

function readStyles(xml: string | undefined): WorkbookStyles {
  const customFormats = new Map<number, string>();
  if (xml === undefined) return { formatIdByStyle: undefined, customFormats };

  const styles = xml.replace(STYLE_COMMENT, "").replace(STYLE_DOCTYPE, "");
  for (const tag of NUMBER_FORMATS.exec(styles)?.[0].match(TAG) ?? []) {
    if (tagName(tag) !== "<numFmt") continue;
    const attributes = parseAttributes(tag);
    const id = Number.parseInt(attributes.get("numFmtId") ?? "", 10);
    if (id > 0) customFormats.set(id, unescapeXml(decodeUtf8(attributes.get("formatCode") ?? "")));
  }

  const cellFormats = CELL_FORMATS.exec(styles);
  if (cellFormats === null) return { formatIdByStyle: undefined, customFormats };

  const formatIds = (cellFormats[0].match(TAG) ?? [])
    .filter((tag) => ["<xf", "<xf/>"].includes(tagName(tag)))
    .map((tag) => {
      const formatId = parseAttributes(tag).get("numFmtId");
      return formatId ? Number.parseInt(formatId, 10) : undefined;
    });
  return { formatIdByStyle: new Map(formatIds.map((formatId, index) => [String(index), formatId])), customFormats };
}

async function readTextEntry(archive: ZipArchive, name: string): Promise<string | undefined> {
  const entry = findZipEntry(archive, name);
  return entry === undefined ? undefined : (await readZipEntry(archive, entry)).toString("latin1");
}

function attributesOfTags(xml: string, name: string): Map<string, string>[] {
  return (xml.match(TAG) ?? []).filter((tag) => tagName(tag) === name).map(parseAttributes);
}

async function findSheetEntry(archive: ZipArchive, position: number): Promise<ZipEntry | undefined> {
  const sheetIds = attributesOfTags((await readTextEntry(archive, "xl/workbook.xml")) ?? "", "<sheet").map((sheet) => sheet.get("id"));
  if (position >= sheetIds.length) return undefined;

  const relationships = attributesOfTags((await readTextEntry(archive, "xl/_rels/workbook.xml.rels")) ?? "", "<Relationship");
  const targets = new Map(relationships.map((relationship) => [relationship.get("Id"), relationship.get("Target")]));
  const target = sheetIds.every((id) => targets.has(id)) ? targets.get(sheetIds[position]) : undefined;
  if (target === undefined) return findZipEntry(archive, `xl/worksheets/sheet${position + 1}.xml`);

  const candidates = [`xl/${target.replace(/\/?xl\//, "")}`, target, `xl/${target}`];
  return candidates.map((name) => findZipEntry(archive, name)).find((entry) => entry !== undefined);
}

function decodeCell(reference: string): { row: number; column: number } {
  let row = 0;
  let column = 0;
  for (let index = 0; index < reference.length; index++) {
    const code = reference.charCodeAt(index);
    if (code >= 48 && code <= 57) row = 10 * row + (code - 48);
    else if (code >= 65 && code <= 90) column = 26 * column + (code - 64);
  }

  return { row: row - 1, column: column - 1 };
}

function decodeRange(range: string): SheetRange {
  let index = 0;
  let code = 0;
  const readNumber = (first: number, last: number, base: number): number => {
    let number = 0;
    for (; index < range.length; index++) {
      code = range.charCodeAt(index);
      if (code < first || code > last) break;
      number = base * number + code - first + (base === 26 ? 1 : 0);
    }
    return number - 1;
  };

  const firstColumn = readNumber(65, 90, 26);
  const firstRow = readNumber(48, 57, 10);
  if (index === range.length || code !== 58) return { firstRow, lastRow: firstRow, firstColumn, lastColumn: firstColumn };

  index++;
  const lastColumn = readNumber(65, 90, 26);
  return { firstRow, lastRow: readNumber(48, 57, 10), firstColumn, lastColumn };
}

function dimensionRange(head: string): SheetRange | undefined {
  const start = head.search(DIMENSION);
  const reference = start > 0 ? DIMENSION_RANGE.exec(head.slice(start, start + 50))?.[1] : undefined;
  if (reference === undefined) return undefined;

  const range = decodeRange(reference);
  const isValid = range.firstRow <= range.lastRow && range.firstColumn <= range.lastColumn && range.firstRow >= 0 && range.firstColumn >= 0;
  return isValid ? range : undefined;
}

function formatText(workbook: WorkbookContext, formatId: number, value: CellValue): string {
  try {
    return workbook.format(workbook.styles.customFormats.get(formatId) ?? SHEETJS_IMPLICIT_FORMATS.get(formatId) ?? formatId, value);
  } catch {
    return workbook.format(0, value);
  }
}

function formattedCell(workbook: WorkbookContext, type: "n" | "s" | "b", value: CellValue, style: string | undefined): SheetCell {
  const formatId = style === undefined ? undefined : workbook.styles.formatIdByStyle?.get(style);
  return { type, value, text: formatText(workbook, formatId ?? 0, value) };
}

function sharedString(workbook: WorkbookContext, value: string): string | undefined {
  const index = Number.parseInt(value, 10);
  if (!(index >= 0 && index < workbook.sharedStrings.length)) throw new Error(`Workbook "${workbook.fileName}" has no shared string ${value}`);

  return workbook.sharedStrings[index];
}

function readCell(
  workbook: WorkbookContext,
  type: string,
  value: string | undefined,
  body: string,
  style: string | undefined,
): SheetCell | undefined {
  switch (type) {
    case "n":
      return value === undefined || value === "" ? undefined : formattedCell(workbook, "n", Number.parseFloat(value), style);
    case "s":
      return value === undefined ? undefined : formattedCell(workbook, "s", sharedString(workbook, value), style);
    case "str":
      return formattedCell(workbook, "s", value === undefined ? "" : decodeUtf8(value), style);
    case "inlineStr": {
      const inlineString = INLINE_STRING.exec(body);
      return formattedCell(workbook, "s", inlineString === null ? "" : readStringItem(inlineString[1] ?? ""), style);
    }
    case "b":
      return formattedCell(workbook, "b", value === "1" || value === "true" || value === "TRUE", style);
    case "e":
      return { type: "e", value: ERROR_CODES.get(value ?? ""), text: value ?? "" };
    default:
      throw new Error(`Workbook "${workbook.fileName}" has a cell of type "${type}", which is not read`);
  }
}

function findRowTag(rowXml: string): { start: number; end: number } {
  let start = 0;
  for (let index = 0; index < rowXml.length; index++) {
    if (rowXml[index] === "<") start = index;
    else if (rowXml[index] === ">" && rowXml[index - 1] !== "/") return { start, end: index + 1 };
  }

  return { start, end: rowXml.length };
}

function isXmlSpace(code: number): boolean {
  return code === 32 || code === 10 || code === 13 || code === 9;
}

function readTag(xml: string, start: number, end: number): CellTag {
  const tag: CellTag = { reference: undefined, style: undefined, type: undefined };
  for (let equals = xml.indexOf("=", start); equals !== -1 && equals < end;) {
    let nameEnd = equals;
    while (isXmlSpace(xml.charCodeAt(nameEnd - 1))) nameEnd--;
    let valueStart = equals + 1;
    while (isXmlSpace(xml.charCodeAt(valueStart))) valueStart++;
    const quote = xml[valueStart];
    const valueEnd = quote === '"' || quote === "'" ? xml.indexOf(quote, valueStart + 1) : -1;
    if (valueEnd === -1 || valueEnd >= end) break;

    if (isXmlSpace(xml.charCodeAt(nameEnd - 2))) {
      const name = xml[nameEnd - 1];
      if (name === "r") tag.reference = xml.slice(valueStart + 1, valueEnd);
      else if (name === "s") tag.style = xml.slice(valueStart + 1, valueEnd);
      else if (name === "t") tag.type = xml.slice(valueStart + 1, valueEnd);
    }
    equals = xml.indexOf("=", valueEnd + 1);
  }

  return tag;
}

function isWordCharacter(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function qualifiedNameStart(xml: string, localName: number): number {
  if (xml.charCodeAt(localName - 1) !== 58) return localName;

  let start = localName - 1;
  while (isWordCharacter(xml.charCodeAt(start - 1))) start--;
  return start < localName - 1 ? start : localName;
}

function findCellName(xml: string, from: number): number {
  for (let name = xml.indexOf("c", from); name !== -1; name = xml.indexOf("c", name + 1)) {
    const next = xml.charCodeAt(name + 1);
    const endsName = next === 32 || next === 47 || next === 62;
    if (endsName && xml.charCodeAt(qualifiedNameStart(xml, name) - 1) === 60) return name;
  }

  return -1;
}

function findRowEnd(xml: string, from: number): number {
  for (let nameEnd = xml.indexOf("w>", from); nameEnd !== -1; nameEnd = xml.indexOf("w>", nameEnd + 2)) {
    const nameStart = qualifiedNameStart(xml, nameEnd - 2);
    if (xml.startsWith("ro", nameEnd - 2) && xml.startsWith("</", nameStart - 2)) return nameStart - 2;
  }

  return -1;
}

function cellTagEnd(xml: string, contentStart: number, contentEnd: number): number {
  if (xml.startsWith("<", contentStart)) return contentStart;

  const tagClose = xml.indexOf(">", contentStart);
  return tagClose === -1 || tagClose >= contentEnd ? contentEnd : tagClose + 1;
}

function cellValue(xml: string, bodyStart: number, bodyEnd: number): string | undefined {
  if (xml.startsWith("<v>", bodyStart)) {
    const valueEnd = xml.indexOf("</v>", bodyStart + 3);
    if (valueEnd !== -1 && valueEnd < bodyEnd) return xml.slice(bodyStart + 3, valueEnd);
  }
  const firstTag = xml.indexOf("<", bodyStart);
  if (firstTag === -1 || firstTag >= bodyEnd) return undefined;

  return CELL_VALUE.exec(xml.slice(bodyStart, bodyEnd))?.[1];
}

function parseRow(workbook: WorkbookContext, chunk: string, previousRowNumber: number, lastColumn: number): ParsedRow | undefined {
  const rowXml = chunk.trim();
  if (rowXml.length === 0) return undefined;

  const { start, end } = findRowTag(rowXml);
  const rowReference = readTag(rowXml, start, end).reference;
  const rowNumber = rowReference === undefined ? previousRowNumber + 1 : Number.parseInt(rowReference, 10);
  const cells: PlacedCell[] = [];
  let column = -1;

  for (let cellName = findCellName(rowXml, end), nextName = cellName; cellName !== -1; cellName = nextName) {
    let contentStart = cellName + 2;
    nextName = findCellName(rowXml, contentStart);
    const contentEnd = nextName === -1 ? rowXml.length : rowXml.lastIndexOf("<", nextName);
    while (contentStart < contentEnd && isXmlSpace(rowXml.charCodeAt(contentStart))) contentStart++;
    if (contentStart === contentEnd) continue;

    const tagEnd = cellTagEnd(rowXml, contentStart, contentEnd);
    const tag = readTag(rowXml, contentStart, tagEnd);
    const position = tag.reference ? decodeCell(tag.reference) : { row: rowNumber - 1, column: column + 1 };
    if (position.column > lastColumn) break;
    column = position.column;

    const rawValue = cellValue(rowXml, tagEnd, contentEnd);
    const value = rawValue ? unescapeXml(rawValue) : undefined;
    if (tag.type === undefined && value === undefined) continue;

    cells.push({ ...position, cell: readCell(workbook, tag.type || "n", value, rowXml.slice(tagEnd, contentEnd), tag.style) });
  }

  return { rowNumber, cells };
}

async function* sheetXmlParts(archive: ZipArchive, entry: ZipEntry): AsyncGenerator<string> {
  let pending = "";
  let hasHead = false;

  for await (const chunk of inflateZipEntry(archive, entry)) {
    pending += Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString("latin1");
    if (!hasHead) {
      const sheetDataStart = SHEET_DATA_START.exec(pending);
      if (sheetDataStart === null) continue;

      hasHead = true;
      yield pending.slice(0, sheetDataStart.index);
      if (sheetDataStart[0].endsWith("/>")) return;
      pending = pending.slice(sheetDataStart.index + sheetDataStart[0].length);
    }

    let consumed = 0;
    for (let rowEnd = findRowEnd(pending, 0); rowEnd !== -1; rowEnd = findRowEnd(pending, consumed)) {
      yield pending.slice(consumed, rowEnd);
      consumed = pending.indexOf(">", rowEnd) + 1;
    }
    pending = pending.slice(consumed);

    const sheetDataEnd = SHEET_DATA_END.exec(pending);
    if (sheetDataEnd !== null) {
      yield pending.slice(0, sheetDataEnd.index);
      return;
    }
  }

  if (!hasHead) yield pending;
}

async function guessRange(workbook: WorkbookContext, archive: ZipArchive, entry: ZipEntry): Promise<SheetRange | undefined> {
  const range = { firstRow: RANGE_GUESS_START, lastRow: 0, firstColumn: RANGE_GUESS_START, lastColumn: 0 };
  const parts = sheetXmlParts(archive, entry);
  let rowNumber = 0;
  await parts.next();
  for await (const part of parts) {
    const row = parseRow(workbook, part, rowNumber, Number.POSITIVE_INFINITY);
    if (row === undefined) continue;

    rowNumber = row.rowNumber;
    if (range.firstRow > rowNumber - 1) range.firstRow = rowNumber - 1;
    if (range.lastRow < rowNumber - 1) range.lastRow = rowNumber - 1;
    for (const { column } of row.cells) {
      if (range.firstColumn > column) range.firstColumn = column;
      if (range.lastColumn < column) range.lastColumn = column;
    }
  }

  return range.lastColumn >= range.firstColumn && range.lastRow >= range.firstRow ? range : undefined;
}

async function* rowsInRange(workbook: WorkbookContext, parts: AsyncIterable<string>, range: SheetRange, width: RowWidth): AsyncGenerator<SheetCells> {
  const lastColumn = (): number => Math.min(range.lastColumn, range.firstColumn + width.lastColumn);
  let emptyTemplate: SheetCells = [];
  const emptyRow = (): SheetCells => {
    const length = lastColumn() - range.firstColumn + 1;
    if (emptyTemplate.length !== length) emptyTemplate = Array.from<SheetCell | undefined>({ length });
    return emptyTemplate.slice();
  };
  let current = emptyRow();
  let currentRow = -1;
  let nextRow = range.firstRow;
  let rowNumber = 0;

  for await (const part of parts) {
    const row = parseRow(workbook, part, rowNumber, lastColumn());
    if (row === undefined) continue;

    rowNumber = row.rowNumber;
    for (const placed of row.cells) {
      const isInRange =
        placed.row >= range.firstRow && placed.row <= range.lastRow && placed.column >= range.firstColumn && placed.column <= range.lastColumn;
      if (placed.cell === undefined || !isInRange) continue;

      if (placed.row !== currentRow) {
        if (placed.row < currentRow) throw new Error(`Workbook "${workbook.fileName}" lists its rows out of order`);
        if (currentRow !== -1) yield current;
        for (; nextRow < placed.row; nextRow++) yield emptyRow();
        current = emptyRow();
        currentRow = placed.row;
        nextRow = placed.row + 1;
      }
      const index = placed.column - range.firstColumn;
      if (index < current.length) current[index] = placed.cell;
    }
  }

  if (currentRow !== -1) yield current;
  for (; nextRow <= range.lastRow; nextRow++) yield emptyRow();
}

export function cellText(cell: SheetCell | undefined): string {
  return cell?.value !== undefined ? cell.text : "";
}

export async function* readSheetRows(
  file: LocalFile,
  position: number,
  width: RowWidth = { lastColumn: Number.POSITIVE_INFINITY },
): AsyncGenerator<SheetCells> {
  const archive = await openZip(file.path);
  const entry = await findSheetEntry(archive, position);
  if (entry === undefined) throw new Error(`Workbook "${file.fileName}" has no sheet at position ${position + 1}`);

  const { default: XLSX } = await import("xlsx");
  const workbook: WorkbookContext = {
    fileName: file.fileName,
    sharedStrings: readSharedStrings(await readTextEntry(archive, "xl/sharedStrings.xml")),
    styles: readStyles(await readTextEntry(archive, "xl/styles.xml")),
    format: XLSX.SSF.format,
  };
  const parts = sheetXmlParts(archive, entry);
  try {
    const head = await parts.next();
    if (head.done) return;

    const range = dimensionRange(head.value) ?? (await guessRange(workbook, archive, entry));
    if (range !== undefined) yield* rowsInRange(workbook, parts, range, width);
  } finally {
    await parts.return(undefined);
  }
}
