import assert from "node:assert/strict";
import test from "node:test";

import { parseNsg } from "../../src/lib/nsg-parser";
import { mixedRecordingBytes } from "./fixtures/nsgContainer";

const encoder = new TextEncoder();

void test("streams input with start/end progress and cancels the reader on malformed input", async () => {
  const bytes = mixedRecordingBytes();
  const progress: number[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += 29) controller.enqueue(bytes.slice(index, index + 29));
      controller.close();
    },
  });
  const log = await parseNsg({ stream, source: { name: "stream.log", size: bytes.length } }, { onProgress: (value) => progress.push(value.percent) });
  assert.equal(log.cells.length, 3);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  let cancelled = false;
  const invalid = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("bad!"));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(parseNsg({ stream: invalid, source: { name: "bad.log", size: 4 } }), /Expected an NSG !NSG log/);
  assert.equal(cancelled, true);
});
