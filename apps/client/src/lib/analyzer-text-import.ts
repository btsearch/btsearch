import { ANALYZER_MAX_CELLS, AnalyzerImportError } from "./analyzer-import";
/* oxlint-disable no-await-in-loop -- Ordered stream reads and batch yields bound memory and keep cancellation responsive */
import { type FileFormat, type ParsedRow, detectFormat, parseFile } from "./analyzer-parsers";

type TextFileFormat = Exclude<FileFormat, "nsg">;

const MAX_LINE_LENGTH = 16 * 1024 * 1024;
const TEXT_PREFIXES = {
  ntm: new Set(["2G", "3G", "4G", "5G"]),
  netmonitor: new Set(["G", "W", "T", "L", "N"]),
};

export class AnalyzerTextImportError extends AnalyzerImportError {}

type ImportOptions = {
  signal?: AbortSignal;
  onProgress?: (bytesRead: number) => void;
  format?: TextFileFormat;
};

function detectTextFormat(fileName: string, line: string): TextFileFormat {
  return detectFormat(fileName, line) === "netmonitor" ? "netmonitor" : "ntm";
}

export async function importAnalyzerTextFile(
  file: File,
  { signal, onProgress, format: requestedFormat }: ImportOptions = {},
): Promise<{ rows: ParsedRow[]; format: TextFileFormat }> {
  const rows: ParsedRow[] = [];
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
      const delimiter = content.indexOf(";");
      const trimmed = content.trimEnd();
      if (delimiter === -1 && trimmed.length <= 2) {
        prefix = trimmed;
        prefixHasTrailingWhitespace = content.length > trimmed.length;
        return;
      }
      const token = delimiter === -1 ? content : content.slice(0, delimiter);
      format ??= detectTextFormat(file.name, `${token};`);
      prefix = "";
      if (!TEXT_PREFIXES[format].has(token)) {
        discarding = true;
        return;
      }
      candidate = true;
    }
    lineLength += content.length;
    if (lineLength > MAX_LINE_LENGTH) throw new AnalyzerTextImportError("readFailed", "An analyzer cell record exceeds the supported length.");
    parts.push(content);
  };
  const finishLine = () => {
    if (!format && prefix.trim().length > 0) format = detectTextFormat(file.name, prefix);
    if (candidate && format) {
      const parsed = parseFile(format, parts.join(""));
      if (rows.length + parsed.length > ANALYZER_MAX_CELLS)
        throw new AnalyzerTextImportError("tooManyCells", `The file contains more than ${ANALYZER_MAX_CELLS.toLocaleString("en-US")} cells.`);
      rows.push(...parsed);
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
    return { rows, format: format ?? detectTextFormat(file.name, "") };
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
