import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { parseNsg } from "../../src/lib/nsg-parser";
import { isNsgFileHeader, openNsgFile } from "../../src/lib/nsg-parser/browser";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import type { NsgProgress } from "../../src/lib/nsg-parser/model";
import { concatBytes as concat } from "./binary";
import { mixedRecordingBytes } from "./fixtures/nsgContainer";

const encoder = new TextEncoder();

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

void test("streams gzip logs with compressed-byte progress and physical source metadata", async () => {
  const bytes = mixedRecordingBytes();
  const compressed = Uint8Array.from(gzipSync(bytes));
  const file = new File([compressed], "synthetic.LOG.GZ", { type: "application/gzip" });
  const progress: NsgProgress[] = [];
  const { stream, source } = await openNsgFile(file);
  const log = await parseNsg({ stream, source }, { onProgress: (value) => progress.push(value) });

  assert.ok(file.size < bytes.length);
  assert.equal(isNsgFileHeader(compressed), true);
  assert.deepEqual(log, { ...parseRecording(bytes), sourceName: file.name, sourceBytes: file.size });
  assert.equal(progress[0]?.bytesRead, 0);
  assert.equal(progress.at(-1)?.bytesRead, file.size);
  assert.equal(progress.at(-1)?.percent, 100);
  assert.ok(progress.slice(0, -1).every(({ bytesRead, percent }) => bytesRead < file.size && percent < 100));
  assert.ok(progress.every(({ bytesRead, percent }) => bytesRead >= 0 && bytesRead <= file.size && percent >= 0 && percent <= 100));
  assert.ok(progress.every(({ bytesRead }, index) => index === 0 || bytesRead >= progress[index - 1].bytesRead));
});

void test("streams concatenated gzip members as one NSG log", async () => {
  const bytes = mixedRecordingBytes();
  const splitAt = Math.floor(bytes.length / 2);
  const compressed = concat(Uint8Array.from(gzipSync(bytes.subarray(0, splitAt))), Uint8Array.from(gzipSync(bytes.subarray(splitAt))));
  const file = new File([compressed], "multi-member.log.gz", { type: "application/gzip" });
  const { stream, source } = await openNsgFile(file);

  assert.deepEqual(await parseNsg({ stream, source }), { ...parseRecording(bytes), sourceName: file.name, sourceBytes: file.size });
});

void test("continues when an input chunk ends exactly at a gzip member boundary", async () => {
  const bytes = mixedRecordingBytes();
  const splitAt = Math.floor(bytes.length / 2);
  const members = [Uint8Array.from(gzipSync(bytes.subarray(0, splitAt))), Uint8Array.from(gzipSync(bytes.subarray(splitAt)))];
  const file = new File(members, "chunked-members.log.gz", { type: "application/gzip" });
  Object.defineProperty(file, "stream", {
    value: () => {
      let index = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (index === members.length) controller.close();
          else controller.enqueue(members[index++]);
        },
      });
    },
  });
  const { stream, source } = await openNsgFile(file);

  assert.deepEqual(await parseNsg({ stream, source }), { ...parseRecording(bytes), sourceName: file.name, sourceBytes: file.size });
});

void test("keeps raw file streaming unchanged and rejects invalid gzip contents", async () => {
  const bytes = mixedRecordingBytes();
  const rawFile = new File([bytes], "synthetic.log");
  const rawInput = await openNsgFile(rawFile);
  assert.equal(isNsgFileHeader(bytes), true);
  assert.deepEqual(await parseNsg(rawInput), parseRecording(bytes));

  const invalidPayload = Uint8Array.from(gzipSync(encoder.encode("bad!")));
  const invalidInput = await openNsgFile(new File([invalidPayload], "bad.log.gz"));
  await assert.rejects(parseNsg(invalidInput), /Expected an NSG !NSG log/);

  const truncated = Uint8Array.from(gzipSync(bytes)).subarray(0, -4);
  const truncatedInput = await openNsgFile(new File([truncated], "truncated.log.gz"));
  await assert.rejects(parseNsg(truncatedInput));

  const complete = Uint8Array.from(gzipSync(bytes));
  const missingCrc = concat(complete.subarray(0, -8), complete.subarray(-4));
  const missingCrcInput = await openNsgFile(new File([missingCrc], "missing-crc.log.gz"));
  await assert.rejects(parseNsg(missingCrcInput));

  const corruptSize = Uint8Array.from(gzipSync(bytes));
  corruptSize[corruptSize.length - 4] ^= 0xff;
  const corruptSizeInput = await openNsgFile(new File([corruptSize], "bad-size.log.gz"));
  await assert.rejects(parseNsg(corruptSizeInput), /Invalid gzip member size/);

  const splitAt = Math.floor(bytes.length / 2);
  const corruptFirstMember = Uint8Array.from(gzipSync(bytes.subarray(0, splitAt)));
  corruptFirstMember[corruptFirstMember.length - 4] ^= 0xff;
  const corruptMemberInput = await openNsgFile(new File([corruptFirstMember, gzipSync(bytes.subarray(splitAt))], "bad-member-size.log.gz"));
  await assert.rejects(parseNsg(corruptMemberInput), /Invalid gzip member size/);
});

void test("accepts an empty gzip member between valid members", async () => {
  const bytes = mixedRecordingBytes();
  const splitAt = Math.floor(bytes.length / 2);
  const file = new File(
    [gzipSync(bytes.subarray(0, splitAt)), gzipSync(new Uint8Array()), gzipSync(bytes.subarray(splitAt))],
    "empty-middle-member.log.gz",
  );
  const input = await openNsgFile(file);

  assert.deepEqual(await parseNsg(input), { ...parseRecording(bytes), sourceName: file.name, sourceBytes: file.size });
});

void test("does not classify a one-byte gzip prefix as an NSG file", async () => {
  const shortHeader = Uint8Array.of(0x1f);
  assert.equal(isNsgFileHeader(shortHeader), false);

  const input = await openNsgFile(new File([shortHeader], "short-header.log.gz"));
  await assert.rejects(parseNsg(input), /Expected an NSG !NSG log/);
});
