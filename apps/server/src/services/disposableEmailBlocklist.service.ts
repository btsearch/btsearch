import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { domainToASCII } from "node:url";

import { logger, serializeError } from "../utils/logger.js";

const BLOCKLIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf";
const BLOCKLIST_PATH = process.env.DISPOSABLE_EMAIL_BLOCKLIST_PATH ?? join(tmpdir(), "openbts", "disposable_email_blocklist.conf");
const BLOCKLIST_DIRECTORY = dirname(BLOCKLIST_PATH);
const MINIMUM_DOMAIN_COUNT = 5_000;
const MAXIMUM_BLOCKLIST_BYTES = 1024 * 1024;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

let disposableEmailDomains: ReadonlySet<string> | undefined;

function normalizeDomain(domain: string): string {
  return domainToASCII(domain.trim().replace(/\.$/u, "")).toLowerCase();
}

function isValidDomain(domain: string): boolean {
  if (domain.length > 253 || !domain.includes(".")) return false;
  return domain.split(".").every((label) => DOMAIN_LABEL_PATTERN.test(label));
}

export function parseDisposableEmailBlocklist(content: string): ReadonlySet<string> {
  const domains = new Set<string>();

  for (const line of content.split(/\r?\n/u)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;

    const domain = normalizeDomain(value);
    if (!isValidDomain(domain)) throw new Error("Disposable email blocklist contains an invalid domain");
    domains.add(domain);
  }

  if (domains.size < MINIMUM_DOMAIN_COUNT) throw new Error(`Disposable email blocklist contains only ${domains.size} domains`);
  return domains;
}

async function readResponseBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAXIMUM_BLOCKLIST_BYTES)
    throw new Error(`Disposable email blocklist exceeds ${MAXIMUM_BLOCKLIST_BYTES} bytes`);
  if (!response.body) throw new Error("Disposable email blocklist response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const readNextChunk = async (size: number, content: string): Promise<string> => {
    const { done, value } = await reader.read();
    if (done) return content + decoder.decode();

    const nextSize = size + value.byteLength;
    if (nextSize > MAXIMUM_BLOCKLIST_BYTES) {
      await reader.cancel();
      throw new Error(`Disposable email blocklist exceeds ${MAXIMUM_BLOCKLIST_BYTES} bytes`);
    }
    return readNextChunk(nextSize, content + decoder.decode(value, { stream: true }));
  };

  return readNextChunk(0, "");
}

async function readBlocklistFile(): Promise<ReadonlySet<string>> {
  return parseDisposableEmailBlocklist(await readFile(BLOCKLIST_PATH, "utf8"));
}

export async function refreshDisposableEmailBlocklist(): Promise<void> {
  const temporaryPath = `${BLOCKLIST_PATH}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const response = await fetch(BLOCKLIST_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Disposable email blocklist request failed with status ${response.status}`);

    const content = await readResponseBody(response);
    const domains = parseDisposableEmailBlocklist(content);

    await mkdir(BLOCKLIST_DIRECTORY, { recursive: true });
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, BLOCKLIST_PATH);

    logger.info("disposable_email_blocklist_refreshed", { domains: domains.size, path: BLOCKLIST_PATH });
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    try {
      const domains = await readBlocklistFile();
      logger.warn("disposable_email_blocklist_refresh_failed", {
        ...serializeError(error),
        domains: domains.size,
        path: BLOCKLIST_PATH,
        usingCachedFile: true,
      });
    } catch (cacheError) {
      logger.error("disposable_email_blocklist_unavailable", {
        refreshError: serializeError(error),
        cacheError: serializeError(cacheError),
        path: BLOCKLIST_PATH,
      });
    }
  }
}

export async function loadDisposableEmailBlocklist(): Promise<void> {
  try {
    disposableEmailDomains = await readBlocklistFile();
  } catch (error) {
    disposableEmailDomains = undefined;
    logger.error("disposable_email_blocklist_load_failed", {
      ...serializeError(error),
      path: BLOCKLIST_PATH,
    });
  }
}

export function isDisposableEmailBlocklistReady(): boolean {
  return disposableEmailDomains !== undefined;
}

export function isDisposableEmail(email: string): boolean {
  if (!disposableEmailDomains) return false;

  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex === -1) return false;

  const domain = normalizeDomain(email.slice(separatorIndex + 1));
  if (!domain) return false;

  const labels = domain.split(".");
  for (let index = 0; index < labels.length - 1; index++) {
    if (disposableEmailDomains.has(labels.slice(index).join("."))) return true;
  }

  return false;
}
