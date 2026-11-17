import { isCelldexHead, parseCelldexFile } from "./analyzerCelldex";
import { ANALYZER_MAX_CELLS, AnalyzerImportError } from "./analyzerImport";
/* oxlint-disable no-await-in-loop -- Ordered stream reads and batch yields bound memory and keep cancellation responsive */
import { type AnalyzerLineFormat, type AnalyzerTextFormat, type ParsedRow, formatOfFileName, parseFile, recordFormatOf } from "./analyzerParsers";

const MAX_LINE_LENGTH = 16 * 1024 * 1024;
const MAX_TOKEN_LENGTH = 16;
const TOKEN_DELIMITER = /[;\t]/;
const CELLDEX_HEAD_BYTES = 4096;

export class AnalyzerTextImportError extends AnalyzerImportError {}

type ImportOptions = {
  signal?: AbortSignal;
  onProgress?: (bytesRead: number) => void;
  format?: AnalyzerLineFormat;
};
type TextImport = { rows: ParsedRow[]; format: AnalyzerTextFormat; skippedLines: number };

function cellLimitError(cellCount: number): AnalyzerTextImportError {
  return new AnalyzerTextImportError("tooManyCells", `The file contains more than ${ANALYZER_MAX_CELLS.toLocaleString("en-US")} cells.`, cellCount);
}

async function importCelldexFile(file: File, onProgress: ImportOptions["onProgress"]): Promise<TextImport> {
  const { rows, skippedLines } = parseCelldexFile(await file.text());
  onProgress?.(file.size);
  if (rows.length > ANALYZER_MAX_CELLS) throw cellLimitError(rows.length);
  return { rows, format: "celldex", skippedLines };
}

export async function importAnalyzerTextFile(file: File, { signal, onProgress, format: requestedFormat }: ImportOptions = {}): Promise<TextImport> {
  const rows: ParsedRow[] = [];
  let skippedLines = 0;
  let cellsOverLimit = 0;
  let format = requestedFormat;
  let prefix = "";
  let prefixHasTrailingWhitespace = false;
  let parts: string[] = [];
  let lineLength = 0;
  let discarding = false;
  let candidate = false;
  let bytesRead = 0;
  let lastYield = performance.now();
  let linesSinceYield = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const checkAborted = () => {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
  };
  const cancelReader = () => {
    void reader?.cancel().catch(() => {});
  };
  const yieldIfNeeded = async () => {
    checkAborted();
    if (performance.now() - lastYield < 8) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkAborted();
    lastYield = performance.now();
  };
  const append = (segment: string) => {
    if (discarding) return;
    let content = segment;
    if (!candidate) {
      content = prefix + (prefixHasTrailingWhitespace ? " " : "") + (prefix.length === 0 ? segment.trimStart() : segment);
      if (content.length === 0) return;
      const delimiter = content.search(TOKEN_DELIMITER);
      const trimmed = content.trimEnd();
      if (delimiter === -1 && trimmed.length <= MAX_TOKEN_LENGTH) {
        prefix = trimmed;
        prefixHasTrailingWhitespace = content.length > trimmed.length;
        return;
      }
      const token = delimiter === -1 ? content : content.slice(0, delimiter);
      const lineFormat = recordFormatOf(token);
      prefix = "";
      if (lineFormat === null || (format !== undefined && lineFormat !== format)) {
        discarding = true;
        return;
      }
      format = lineFormat;
      candidate = true;
    }
    lineLength += content.length;
    if (lineLength > MAX_LINE_LENGTH) throw new AnalyzerTextImportError("readFailed", "An analyzer cell record exceeds the supported length.");
    parts.push(content);
  };
  const finishLine = () => {
    if (candidate && format) {
      const parsed = parseFile(format, parts.join(""));
      if (parsed.length === 0) skippedLines++;
      for (const row of parsed) {
        if (rows.length < ANALYZER_MAX_CELLS) rows.push(row);
        else cellsOverLimit++;
      }
    } else if (discarding || prefix.trim().length > 0) {
      skippedLines++;
    }
    prefix = "";
    prefixHasTrailingWhitespace = false;
    parts = [];
    lineLength = 0;
    discarding = false;
    candidate = false;
  };
  const consume = async (text: string) => {
    let start = 0;
    for (let end = text.indexOf("\n"); end !== -1; end = text.indexOf("\n", start)) {
      append(text.slice(start, end));
      finishLine();
      start = end + 1;
      if (++linesSinceYield >= 256) {
        linesSinceYield = 0;
        await yieldIfNeeded();
      }
    }
    append(text.slice(start));
  };

  try {
    checkAborted();
    if (requestedFormat === undefined && isCelldexHead(await file.slice(0, CELLDEX_HEAD_BYTES).text())) {
      checkAborted();
      const imported = await importCelldexFile(file, onProgress);
      checkAborted();
      return imported;
    }
    reader = file.stream().getReader();
    signal?.addEventListener("abort", cancelReader, { once: true });
    checkAborted();
    const decoder = new TextDecoder("utf-8");
    for (;;) {
      const chunk = await reader.read();
      checkAborted();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      onProgress?.(bytesRead);
      checkAborted();
      await consume(decoder.decode(chunk.value, { stream: true }));
      await yieldIfNeeded();
    }
    await consume(decoder.decode());
    finishLine();
    checkAborted();
    if (cellsOverLimit > 0) throw cellLimitError(ANALYZER_MAX_CELLS + cellsOverLimit);
    return { rows, format: format ?? formatOfFileName(file.name), skippedLines };
  } catch (error) {
    checkAborted();
    if (error instanceof AnalyzerTextImportError) throw error;
    throw new AnalyzerTextImportError("readFailed", error instanceof Error ? error.message : "Unable to read the analyzer file.");
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
