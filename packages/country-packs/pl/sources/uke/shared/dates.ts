import type { SheetValue } from "./sheets.ts";

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const DASHED_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const FILE_NAME_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const ISO_DAY_LENGTH = 10;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, ISO_DAY_LENGTH);
}

function parseDashedDate([, first = "", second = "", year = ""]: RegExpMatchArray): Date {
  const isMonthFirst = Number.parseInt(first, 10) <= 12 && Number.parseInt(second, 10) > 12;
  return new Date(isMonthFirst ? `${year}-${first}-${second}` : `${year}-${second}-${first}`);
}

export function parseExcelDate(value: SheetValue, now: Date): Date {
  if (value === null || value === undefined || value === "") return new Date(now.getTime());
  if (typeof value === "number") return new Date(EXCEL_EPOCH_MS + value * MS_PER_DAY);

  const dashedDate = String(value).match(DASHED_DATE);
  const date = dashedDate ? parseDashedDate(dashedDate) : new Date(typeof value === "string" ? value : Number(value));
  return Number.isNaN(date.getTime()) ? new Date(now.getTime()) : date;
}

export function parseExcelDay(value: SheetValue, now: Date): string {
  return isoDay(parseExcelDate(value, now));
}

export function publishedOnFromFileName(fileName: string): string | null {
  const match = fileName.match(FILE_NAME_DATE);
  if (!match) return null;

  const [, year = "", month = "", day = ""] = match;
  return isoDay(new Date(Date.UTC(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, Number.parseInt(day, 10))));
}

export function rowsCreatedOnNewestDay<Row extends { createdAt: Date }>(rows: readonly Row[]): { day: string; rows: Row[] } | null {
  if (rows.length === 0) return null;

  const newestCreatedAt = rows.reduce((latest, row) => Math.max(latest, row.createdAt.getTime()), Number.NEGATIVE_INFINITY);
  const dayStart = Math.floor(newestCreatedAt / MS_PER_DAY) * MS_PER_DAY;
  return { day: isoDay(new Date(dayStart)), rows: rows.filter((row) => row.createdAt.getTime() >= dayStart) };
}
