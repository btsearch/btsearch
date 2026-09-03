import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { URL } from "node:url";
import * as XLSX from "xlsx";

import { DOWNLOAD_DIR } from "./config.js";

interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export function convertDMSToDD(input: string): number | null {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  // Supports formats: "18E43'49.2''" or "18E43'49''" or "18E43'49"
  const m = s.match(/^(?<deg>\d{1,3})(?<hemi>[NSEW])(?<min>\d{1,2})'(?<sec>\d{1,2}(?:\.\d+)?)'*"*$/);
  if (!m) return null;

  const { deg, hemi, min, sec } = m.groups as {
    deg: string;
    hemi: "N" | "S" | "E" | "W";
    min: string;
    sec: string;
  };

  const degrees = Number.parseInt(deg, 10);
  const minutes = Number.parseInt(min, 10);
  const seconds = Number.parseFloat(sec);

  if (minutes >= 60 || seconds >= 60) return null;

  let dd = degrees + minutes / 60 + seconds / 3600;
  if (hemi === "S" || hemi === "W") dd = -dd;

  return Number(dd.toFixed(6));
}

export function stripCompanySuffixForName(name: string): string {
  const stripped = name
    .replace(/\bsp\.?\s*z\.?\s*o\.?\s*o\.?\s*\.?/gi, "")
    .replace(/\bs\.?\s*a\.?\s*\.?/gi, "")
    .replace(/\bspółka z ograniczoną odpowiedzialnością\b/gi, "")
    .replace(/\bspolka z ograniczona odpowiedzialnoscia\b/gi, "")
    .replace(/\bsp\.?\s*k\.?\s*\.?/gi, "")
    .replace(/\bsp\.?\s*j\.?\s*\.?/gi, "")
    .replace(/^\s*[.,-]+\s*/g, "")
    .replace(/\s*[.,-]+\s*$/g, "")
    .replace(/\s+[.,-]+\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped.toLowerCase().includes("nordisk")) return "Nordisk";
  return stripped;
}

export function ensureDownloadDir(): void {
  if (!existsSync(DOWNLOAD_DIR)) mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

export async function downloadFile(fileUrl: string, outPath: string): Promise<void> {
  const response = await fetch(fileUrl);
  const body = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
  const temporaryPath = `${outPath}.${randomUUID()}.download`;

  try {
    await pipeline(body, createWriteStream(temporaryPath));
    await rename(temporaryPath, outPath);
  } catch (error) {
    try {
      await rm(temporaryPath, { force: true });
    } catch {}
    throw error;
  }
}

export function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function readSheetAsJson<T extends object>(filePath: string, sheetIndex = 0): T[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = wb.SheetNames[sheetIndex];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<T>(sheet, { raw: true, defval: null });
  return rows;
}

export function getSheetNames(filePath: string): string[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  return wb.SheetNames;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function parseFileDateWithImportTime(href: string, importTime = new Date()): Date {
  const fileName = href.split("/").pop() ?? "";
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(importTime.getTime());

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return new Date(importTime.getTime());

  return new Date(
    Date.UTC(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      importTime.getUTCHours(),
      importTime.getUTCMinutes(),
      importTime.getUTCSeconds(),
      importTime.getUTCMilliseconds(),
    ),
  );
}

export function parseExcelDate(val: number | string | null | undefined): Date {
  if (val === null || val === undefined || val === "") return new Date();
  if (typeof val === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + val * 86400000);
  }

  const parts = String(val).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  let date: Date;
  if (parts) {
    const [, a, b, yyyy] = parts as [string, string, string, string];
    const aNum = Number.parseInt(a, 10);
    const bNum = Number.parseInt(b, 10);
    const isMDY = aNum <= 12 && bNum > 12;
    const mm = isMDY ? a : b;
    const dd = isMDY ? b : a;
    date = new Date(`${yyyy}-${mm}-${dd}`);
  } else {
    date = new Date(val);
  }
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function cleanupDownloads(): Promise<void> {
  if (!existsSync(DOWNLOAD_DIR)) return;
  for (const file of readdirSync(DOWNLOAD_DIR)) {
    const p = join(DOWNLOAD_DIR, file);
    try {
      unlinkSync(p);
    } catch {}
  }
  try {
    rmdirSync(DOWNLOAD_DIR);
  } catch {}
}

export function createLogger(prefix: string): Logger {
  function formatMessage(args: unknown[]): unknown[] {
    return [`[${prefix}]`, ...args];
  }

  return {
    log: (...args: unknown[]) => console.log(...formatMessage(args)),
    warn: (...args: unknown[]) => console.warn(...formatMessage(args)),
    error: (...args: unknown[]) => console.error(...formatMessage(args)),
    info: (...args: unknown[]) => console.info(...formatMessage(args)),
    debug: (...args: unknown[]) => console.debug(...formatMessage(args)),
  };
}
