import assert from "node:assert/strict";
import { test } from "node:test";

import { detectFormat, parseFile } from "../src/lib/analyzer/analyzer-parsers";
import { importAnalyzerTextFile } from "../src/lib/analyzer/analyzer-text-import";

const NTM_ROW = "4G;260;03;0;0;0;0;;;Zażółć gęślą 🛰️;0";
const CLF_ROW = "L;260;03;0;0;0;0;;0;0;Zażółć gęślą 🛰️";

class ChunkedFile extends File {
  cancelled = false;

  constructor(
    name: string,
    private readonly bytes: Uint8Array,
    private readonly chunkSize: number,
  ) {
    super([Uint8Array.from(bytes)], name);
  }

  override text(): Promise<string> {
    throw new Error("Whole-file text reads are forbidden in this test");
  }

  override stream(): ReadableStream<Uint8Array> {
    let offset = 0;
    return new ReadableStream({
      pull: (controller) => {
        if (offset === this.bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + this.chunkSize, this.bytes.length);
        controller.enqueue(this.bytes.subarray(offset, end));
        offset = end;
      },
      cancel: () => {
        this.cancelled = true;
      },
    });
  }
}

void test("matches legacy format detection and parsing across UTF-8, BOM, CRLF, comments and final tails", async () => {
  const samples = [
    { name: "cells.ntm", text: `\uFEFF \r\n# ignored\r\n${NTM_ROW}\r\n2G;260;02;12;34;0;0;;;GSM` },
    { name: "cells.clf", text: `# header\r\n${CLF_ROW}\r\nC;260;03;0;0;0;0;0;0;0;unsupported` },
    { name: "cells.txt", text: `\uFEFF\r\n  ${CLF_ROW}\n${CLF_ROW}` },
    { name: "cells.txt", text: `G  \r\n${CLF_ROW}\n` },
    { name: "cells.txt", text: `# header chooses NTM\n${CLF_ROW}\n${NTM_ROW}` },
    { name: "empty.clf", text: "\uFEFF \r\n\t\n" },
  ];
  await Promise.all(
    samples.flatMap((sample) => {
      const expectedFormat = detectFormat(sample.name, sample.text);
      const expectedRows = parseFile(expectedFormat, sample.text);
      return [1, 2, 7, 64].map(async (chunkSize) => {
        const file = new ChunkedFile(sample.name, new TextEncoder().encode(sample.text), chunkSize);
        const progress: number[] = [];
        const actual = await importAnalyzerTextFile(file, { onProgress: (bytes) => progress.push(bytes) });
        assert.equal(actual.format, expectedFormat);
        assert.deepEqual(actual.rows, expectedRows);
        assert.equal(progress.at(-1), file.size);
        assert.ok(progress.every((bytes, index) => index === 0 || bytes > progress[index - 1]));
      });
    }),
  );
});

void test("allows files above 10 MiB and incrementally skips an enormous unsupported line", async () => {
  const file = new File(["#", "x".repeat(17 * 1024 * 1024), "\r\n", NTM_ROW], "large.ntm");
  Object.defineProperty(file, "text", {
    value: () => {
      throw new Error("Whole-file text read");
    },
  });
  const result = await importAnalyzerTextFile(file);
  assert.ok(file.size > 10 * 1024 * 1024);
  assert.deepEqual(result.rows, parseFile("ntm", NTM_ROW));
});

void test("fails an oversized candidate record explicitly instead of returning a partial import", async () => {
  const file = new File([NTM_ROW, "\n4G;", "x".repeat(16 * 1024 * 1024)], "oversized.ntm");
  await assert.rejects(importAnalyzerTextFile(file), { name: "AnalyzerTextImportError", code: "readFailed" });
});

void test("accepts exactly 20,000 actual rows without deduplicating and rejects row 20,001", async () => {
  const repeated = `${NTM_ROW}\n`.repeat(20_000);
  const accepted = await importAnalyzerTextFile(new File(["# ignored\n", repeated], "limit.ntm"));
  assert.equal(accepted.rows.length, 20_000);
  assert.deepEqual(accepted.rows[0], accepted.rows.at(-1));
  await assert.rejects(importAnalyzerTextFile(new File([repeated, NTM_ROW], "over.ntm")), {
    name: "AnalyzerCellLimitError",
    code: "tooManyCells",
  });
});

void test("cancels the stream on abort and rejects an already aborted import", async () => {
  const file = new ChunkedFile("abort.ntm", new TextEncoder().encode(`${NTM_ROW}\n`.repeat(100)), 32);
  const controller = new AbortController();
  await assert.rejects(importAnalyzerTextFile(file, { signal: controller.signal, onProgress: () => controller.abort() }), { name: "AbortError" });
  assert.equal(file.cancelled, true);
  await assert.rejects(importAnalyzerTextFile(file, { signal: controller.signal }), { name: "AbortError" });
});

void test("supports an explicit text-format override when reparsing the original file", async () => {
  const result = await importAnalyzerTextFile(new File([CLF_ROW], "incorrect.ntm"), { format: "netmonitor" });
  assert.equal(result.format, "netmonitor");
  assert.deepEqual(result.rows, parseFile("netmonitor", CLF_ROW));
});
