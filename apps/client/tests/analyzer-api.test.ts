import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

import type { AnalyzerCell } from "../src/lib/analyzer/analyzer-parsers";
import { ANALYZER_CHUNK_CONCURRENCY, ANALYZER_REQUEST_CHUNK_SIZE } from "../src/lib/analyzer/chunks";

type PendingFetch = {
  resolve: (response: Response) => void;
  reject: (reason?: unknown) => void;
};

const CLIENT_ROOT = fileURLToPath(new URL("../", import.meta.url));

function successfulResponse(): Response {
  return new Response(JSON.stringify({ data: [] }), { headers: { "Content-Type": "application/json" } });
}

async function waitForRequestCount(requests: readonly PendingFetch[], count: number, attemptLimit = 100): Promise<void> {
  for (let attempt = 0; attempt < attemptLimit && requests.length !== count; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Let pending Vite requests register between checks.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (requests.length !== count) throw new Error(`Expected ${count} requests, received ${requests.length}`);
}

void test("stops claiming analyzer chunks after the first request failure", async () => {
  const server = await createServer({
    root: CLIENT_ROOT,
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  });
  const originalFetch = globalThis.fetch;
  const requests: PendingFetch[] = [];
  const requestHeaders: Headers[] = [];

  globalThis.fetch = (_input, init) => {
    requestHeaders.push(new Headers(init?.headers));
    return new Promise<Response>((resolve, reject) => requests.push({ resolve, reject }));
  };

  try {
    const analyzerApi = (await server.ssrLoadModule("/src/lib/analyzer/api.ts")) as unknown as typeof import("../src/lib/analyzer/api");
    const cell: AnalyzerCell = { rat: "NR", mnc: 26_001 };
    const cells = Array.from({ length: ANALYZER_REQUEST_CHUNK_SIZE * (ANALYZER_CHUNK_CONCURRENCY + 1) }, () => cell);
    const analysis = analyzerApi.analyzeCellsInChunks(cells);

    await waitForRequestCount(requests, ANALYZER_CHUNK_CONCURRENCY);
    requests[0].reject(new Error("first chunk failed"));
    await assert.rejects(analysis);
    for (const request of requests.slice(1)) request.resolve(successfulResponse());
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(requests.length, ANALYZER_CHUNK_CONCURRENCY);
    assert.ok(requestHeaders.every((headers) => !headers.has("X-Analyzer-Batch-Continuation")));
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
