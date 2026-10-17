import { strToU8, zipSync } from "fflate";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import XLSX from "xlsx";

import type { LocalFile, ReadContext, Release } from "../../core/sources.ts";

export type SheetCells = readonly (readonly unknown[])[];
export type Skip = [slice: string, reason: string];
export type Reading = { ctx: ReadContext; logs: string[]; skips: Skip[]; requests: { url: string; signal: unknown }[] };

export const NOW = new Date("2026-10-12T14:15:16.789Z");

const directory = mkdtempSync(join(tmpdir(), "uke-readers-"));
let workbookCount = 0;

process.on("exit", () => rmSync(directory, { recursive: true, force: true }));

export function writeWorkbook(fileName: string, sheets: readonly SheetCells[]): LocalFile {
  const workbook = XLSX.utils.book_new();
  for (const [index, cells] of sheets.entries()) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cells.map((row) => [...row])), `Sheet${index + 1}`);
  }

  const path = join(directory, `${workbookCount++}-${fileName}`);
  XLSX.writeFile(workbook, path);
  return { url: `https://bip.uke.gov.pl/files/${fileName}`, fileName, path };
}

export function writeArchive(fileName: string, parts: Readonly<Record<string, string>>): LocalFile {
  const path = join(directory, `${workbookCount++}-${fileName}`);
  writeFileSync(path, zipSync(Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)]))));
  return { url: `https://bip.uke.gov.pl/files/${fileName}`, fileName, path };
}

export function startReading(page: { html: string; status?: number } = { html: "" }): Reading {
  const reading: Reading = {
    ctx: {
      fetch: (input, init) => {
        reading.requests.push({ url: input instanceof Request ? input.url : input.toString(), signal: init?.signal });
        return Promise.resolve(new Response(page.html, { status: page.status ?? 200 }));
      },
      signal: new AbortController().signal,
      now: NOW,
      log: (message) => {
        reading.logs.push(message);
      },
      skip: (slice, reason) => {
        reading.skips.push([slice, reason]);
      },
    },
    logs: [],
    skips: [],
    requests: [],
  };

  return reading;
}

export function releaseCovering(slice: string, file: LocalFile): Release {
  return { coveredSlices: [slice], files: [{ url: file.url, fileName: file.fileName }], publishedOn: null };
}

export async function collect<Item>(items: AsyncIterable<Item>): Promise<Item[]> {
  const collected: Item[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

export function filesPage(links: readonly (readonly [href: string, text: string])[]): string {
  const items = links.map(([href, text]) => `<li><div class="part"><a href="${href}">${text}</a></div></li>`).join("");
  const otherLinks = [
    '<a href="/outside-every-list.xlsx">lte800 - outside every list</a>',
    '<ul><li><div class="part"><a href="/2026-09-18_p4.xlsx">lte800 - in another list</a></div></li></ul>',
    '<ul class="files"><li><a href="/2026-09-18_orange.xlsx">lte800 - outside the part</a></li></ul>',
  ];

  return `<html><body>${otherLinks.join("")}<ul class="files">${items}</ul></body></html>`;
}
