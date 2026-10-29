import type { ReleaseFile } from "@openbts/country-packs/sources";
import { officialListedFiles } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Agent, fetch } from "undici";
import type { z } from "zod/v4";

import { isZipContainer } from "./archive.js";
import { LISTING_MAX_AGE_MS } from "./config.js";

const listedFileSelectSchema = createSelectSchema(officialListedFiles);

export type ListedFile = z.infer<typeof listedFileSelectSchema>;
export type FileHead = { sizeBytes: number | null; etag: string | null; lastModified: Date | null };

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const http1Agent = new Agent({ allowH2: false });

export function timedFetch(signal: AbortSignal, timeoutMs: number): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      dispatcher: http1Agent,
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs), ...(init?.signal ? [init.signal] : [])]),
    });
}

function headerDate(value: string | null): Date | null {
  if (value === null) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function headerSize(value: string | null): number | null {
  const size = value === null ? Number.NaN : Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

export async function headFile(fetchPage: typeof fetch, url: string): Promise<FileHead | null> {
  try {
    const response = await fetchPage(url, { method: "HEAD" });
    if (!response.ok) return null;

    return {
      sizeBytes: headerSize(response.headers.get("content-length")),
      etag: response.headers.get("etag"),
      lastModified: headerDate(response.headers.get("last-modified")),
    };
  } catch {
    return null;
  }
}

export function isListedUnchanged(
  listed: ListedFile | undefined,
  file: ReleaseFile,
  publishedOn: string | null,
  head: FileHead | null,
  now: Date,
): boolean {
  if (listed === undefined || head === null) return false;
  if (now.getTime() - listed.checkedAt.getTime() > LISTING_MAX_AGE_MS) return false;

  return (
    listed.fileName === file.fileName &&
    listed.publishedOn === publishedOn &&
    listed.sizeBytes === head.sizeBytes &&
    listed.etag === head.etag &&
    (listed.lastModified?.getTime() ?? null) === (head.lastModified?.getTime() ?? null)
  );
}

async function startsWithZipSignature(filePath: string): Promise<boolean> {
  const file = await open(filePath, "r");
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(ZIP_SIGNATURE.length), 0, ZIP_SIGNATURE.length, 0);
    return bytesRead === ZIP_SIGNATURE.length && buffer.equals(ZIP_SIGNATURE);
  } finally {
    await file.close();
  }
}

export async function downloadFile(fetchFile: typeof fetch, file: ReleaseFile, filePath: string): Promise<void> {
  const response = await fetchFile(file.url);
  if (!response.ok || response.body === null) throw new Error(`${file.url} answered HTTP ${response.status}`);

  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  if (isZipContainer(file.fileName) && !(await startsWithZipSignature(filePath))) {
    throw new Error(`${file.url} is not a ${file.fileName.split(".").pop()} file: it does not start with the zip signature`);
  }
}

export async function hashFile(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  const chunks: AsyncIterable<Buffer> = createReadStream(filePath);
  let sizeBytes = 0;
  for await (const chunk of chunks) {
    hash.update(chunk);
    sizeBytes += chunk.length;
  }

  return { sha256: hash.digest("hex"), sizeBytes };
}

export function releaseHashOf(fileHashes: readonly string[]): string {
  return createHash("sha256").update(fileHashes.join("")).digest("hex");
}
