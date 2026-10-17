import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";

import type { LocalFile } from "../../core/sources.ts";
import { readFirstSheet } from "../sources/uke/shared/sheets.ts";
import { cellText, readSheetRows } from "../sources/uke/shared/workbook.ts";
import { collect, writeArchive, writeWorkbook } from "./sourceFixtures.ts";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const STYLES = [
  `<styleSheet xmlns="${MAIN}">`,
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="0000"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd"/></numFmts>',
  '<cellXfs count="9"><xf numFmtId="0"/><xf numFmtId="4"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="165"/><xf numFmtId="41"/>',
  '<xf numFmtId="49"/><xf numFmtId="5"/><xf numFmtId="32"/></cellXfs>',
  "</styleSheet>",
].join("");
const SHARED_STRINGS = [
  "<t>Plain &amp; simple</t>",
  '<r><rPr><b/></rPr><t>Bold</t></r><r><t xml:space="preserve"> and plain</t></r>',
  "<t>Line_x000D_break</t>",
  "<t>Łódź &#261;</t>",
  "<t/>",
];

type HandmadeSheet = { name: string; part: string; dimension: string | null; rows: string };

const TABLE_SHEET: HandmadeSheet = {
  name: "Table",
  part: "worksheets/sheet2.xml",
  dimension: "A1:C4",
  rows: [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c>',
    '<c r="C1" t="e"><v>#N/A</v></c></row>',
    '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="b"><v>1</v></c><c r="C2"><v>7</v></c></row>',
    '<row r="3"><c r="A3" t="e"><v>#DIV/0!</v></c></row>',
    '<row r="4"><c r="A4" t="str"><v></v></c><c r="B4" s="3"><v>46022</v></c></row>',
  ].join(""),
};
const TEXTS_SHEET: HandmadeSheet = {
  name: "Texts",
  part: "worksheets/sheet1.xml",
  dimension: "B1:G5",
  rows: [
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c>',
    '<c r="D1" t="inlineStr"><is><t>inline</t></is></c>',
    '<c r="E1" t="inlineStr"><is><r><t>rich</t></r><r><t xml:space="preserve"> inline</t></r></is></c>',
    '<c r="F1" t="str"><f>B1</f><v>Gdańsk &amp; okolice</v></c><c r="G1" t="s"><v>3</v></c></row>',
    '<row r="2"><c r="B2" t="b"><v>1</v></c><c r="C2" t="b"><v>0</v></c><c r="D2" t="e"><v>#N/A</v></c><c r="E2" t="e"><v>#SPILL!</v></c>',
    '<c r="F2" s="1"/><c r="G2" t="s"><v>2</v></c></row>',
    '<row r="4"><c r="B4"><v>1234.5</v></c><c r="C4" s="1"><v>1234.5</v></c><c r="D4" s="2"><v>45</v></c><c r="E4" s="3"><v>46022</v></c>',
    '<c r="F4" s="4"><v>46022.5</v></c><c r="H4"><v>9</v></c></row>',
  ].join(""),
};
const STYLED_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const FORMATS_SHEET: HandmadeSheet = {
  name: "Formats",
  part: "worksheets/sheet3.xml",
  dimension: "A1:I3",
  rows: [
    `<row r="1">${STYLED_COLUMNS.map((column, style) => `<c r="${column}1" s="${style}"><v>1234.5</v></c>`).join("")}</row>`,
    '<row r="2"><c r="A2" s="6" t="s"><v>0</v></c><c r="B2" s="1" t="b"><v>1</v></c>',
    '<c r="C2" s="5"><v>0</v></c><c r="D2" s="5" t="s"><v>4</v></c></row>',
    `<row r="3">${STYLED_COLUMNS.map((column, style) => `<c r="${column}3" s="${style}"><v>-1234.5</v></c>`).join("")}</row>`,
  ].join(""),
};
const UNDIMENSIONED_SHEET: HandmadeSheet = {
  name: "Undimensioned",
  part: "worksheets/sheet4.xml",
  dimension: null,
  rows: '<row r="2"><c r="C2" t="s"><v>0</v></c></row><row r="3"><c r="E3"><v>5</v></c></row>',
};
const DATE_TYPED_SHEET: HandmadeSheet = {
  name: "Dated",
  part: "worksheets/sheet5.xml",
  dimension: "A1:A1",
  rows: '<row r="1"><c r="A1" t="d"><v>2025-12-31T00:00:00Z</v></c></row>',
};

function sheetXml(sheet: HandmadeSheet): string {
  const dimension = sheet.dimension === null ? "" : `<dimension ref="${sheet.dimension}"/>`;
  return `<?xml version="1.0"?>\n<worksheet xmlns="${MAIN}">${dimension}<sheetData>${sheet.rows}</sheetData></worksheet>`;
}

function handmadeWorkbook(fileName: string, sheets: readonly HandmadeSheet[]): LocalFile {
  const workbookParts = [
    ["/xl/workbook.xml", "sheet.main+xml"],
    ["/xl/sharedStrings.xml", "sharedStrings+xml"],
    ["/xl/styles.xml", "styles+xml"],
  ];
  const relationships = [
    ...sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="${RELATIONSHIPS}/worksheet" Target="${sheet.part}"/>`),
    `<Relationship Id="rId${sheets.length + 1}" Type="${RELATIONSHIPS}/sharedStrings" Target="sharedStrings.xml"/>`,
    `<Relationship Id="rId${sheets.length + 2}" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/>`,
  ];

  return writeArchive(fileName, {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${workbookParts
      .map(([partName, contentType]) => `<Override PartName="${partName}" ContentType="${CONTENT_TYPE}.${contentType}"/>`)
      .join("")}</Types>`,
    "xl/workbook.xml": `<workbook xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}"><sheets>${sheets
      .map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">${relationships.join("")}</Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="${MAIN}">${SHARED_STRINGS.map((item) => `<si>${item}</si>`).join("")}</sst>`,
    "xl/styles.xml": STYLES,
    ...Object.fromEntries(sheets.map((sheet) => [`xl/${sheet.part}`, sheetXml(sheet)])),
  });
}

async function readTexts(file: LocalFile, position: number): Promise<string[][]> {
  const rows = await collect(readSheetRows(file, position));
  return rows.map((row) => row.map(cellText));
}

function sheetJsTexts(file: LocalFile, position: number): string[][] {
  const workbook = XLSX.readFile(file.path, { dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[position] ?? ""];
  if (sheet?.["!ref"] === undefined) return [];

  const unquote = (field: string): string => (field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field);
  return XLSX.utils
    .sheet_to_csv(sheet, { FS: "\u0001", RS: "\u0002" })
    .split("\u0002")
    .map((line) => line.split("\u0001").map(unquote));
}

function sheetJsFirstSheetRows(file: LocalFile): unknown[] {
  const workbook = XLSX.readFile(file.path, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  return sheet === undefined ? [] : XLSX.utils.sheet_to_json(sheet, { raw: true, defval: null });
}

const HANDMADE = handmadeWorkbook("handmade.xlsx", [TABLE_SHEET, TEXTS_SHEET, FORMATS_SHEET, UNDIMENSIONED_SHEET]);
const WRITTEN = writeWorkbook("written.xlsx", [
  [
    ["Name", "General", "Fixed", "Padded", "Date", "Flag"],
    ["Łódź", 1234.5, { t: "n", v: 1234.5, z: "#,##0.00" }, { t: "n", v: 45, z: "0000" }, { t: "n", v: 46022, z: "yyyy-mm-dd" }, true],
    [],
    ["gap", null, 0.1, null, { t: "n", v: 46022.5, z: "m/d/yy h:mm" }, false],
  ],
  [["second"]],
  [["third"], [null, "spread"]],
]);

void test("workbook: numbers take their General, built-in, custom or date format", async () => {
  assert.deepEqual(await readTexts(WRITTEN, 0), [
    ["Name", "General", "Fixed", "Padded", "Date", "Flag"],
    ["Łódź", "1234.5", "1,234.50", "0045", "2025-12-31", "TRUE"],
    ["", "", "", "", "", ""],
    ["gap", "", "0.1", "", "12/31/25 12:00", "FALSE"],
  ]);
  assert.deepEqual((await readTexts(HANDMADE, 2))[0], [
    "1234.5",
    "1,234.50",
    "1235",
    "5/18/03",
    "1903-05-18",
    " 1,235 ",
    "1234.5",
    "$1,235 ",
    "12:00:00",
  ]);
});

void test("workbook: every text and value matches SheetJS on the same files", async () => {
  const sheets = [
    [HANDMADE, 0],
    [HANDMADE, 1],
    [HANDMADE, 2],
    [HANDMADE, 3],
    [WRITTEN, 0],
    [WRITTEN, 1],
    [WRITTEN, 2],
  ] as const;
  const sheetTexts = await Promise.all(sheets.map(async ([file, position]) => ({ file, position, texts: await readTexts(file, position) })));
  const firstSheets = await Promise.all(
    [HANDMADE, WRITTEN].map(async (file) => ({ file, rows: await collect((await readFirstSheet(file, [])).rows) })),
  );

  for (const { file, position, texts } of sheetTexts) assert.deepEqual(texts, sheetJsTexts(file, position), `${file.fileName} at ${position}`);
  for (const { file, rows } of firstSheets) assert.deepEqual(rows, sheetJsFirstSheetRows(file), file.fileName);
});

void test("first sheet: rows are keyed by their header, empty rows are left out and errors are null", async () => {
  const { headers, rows } = await readFirstSheet(HANDMADE, []);

  assert.deepEqual(headers, ["Name", "Name", ""]);
  assert.deepEqual(await collect(rows), [
    { Name: "Plain & simple", Name_1: true, "#N/A": 7 },
    { Name: "", Name_1: 46022, "#N/A": null },
  ]);
});

void test("first sheet: rows end at the last required or optional column", async () => {
  const required = await readFirstSheet(WRITTEN, ["General"]);
  const optional = await readFirstSheet(WRITTEN, ["Name"], ["Fixed", "Missing"]);

  assert.deepEqual(required.headers, ["Name", "General", "Fixed", "Padded", "Date", "Flag"]);
  assert.deepEqual(await collect(required.rows), [
    { Name: "Łódź", General: 1234.5 },
    { Name: "gap", General: null },
  ]);
  assert.deepEqual(await collect(optional.rows), [
    { Name: "Łódź", General: 1234.5, Fixed: 1234.5 },
    { Name: "gap", General: null, Fixed: 0.1 },
  ]);
});

void test("workbook: once the caller names its last column, later rows stop there", async () => {
  const width = { lastColumn: Number.POSITIVE_INFINITY };
  const texts: string[][] = [];
  for await (const row of readSheetRows(WRITTEN, 0, width)) {
    texts.push(row.map(cellText));
    width.lastColumn = 1;
  }

  assert.deepEqual(texts, [
    ["Name", "General", "Fixed", "Padded", "Date", "Flag"],
    ["Łódź", "1234.5"],
    ["", ""],
    ["gap", ""],
  ]);
});

void test("workbook: a missing sheet or a cell it cannot read fails, naming the file", async () => {
  const dated = handmadeWorkbook("dated.xlsx", [DATE_TYPED_SHEET]);

  await assert.rejects(collect(readSheetRows(WRITTEN, 3)), { message: 'Workbook "written.xlsx" has no sheet at position 4' });
  await assert.rejects(collect(readSheetRows(dated, 0)), { message: 'Workbook "dated.xlsx" has a cell of type "d", which is not read' });
});
