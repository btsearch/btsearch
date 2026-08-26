/* eslint-disable no-await-in-loop -- writes must preserve dump order and honor backpressure */

import { once } from "node:events";
import { type WriteStream, createReadStream, createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";

import { type BufferedBlock, isOwnerStatement } from "./dump.mjs";

export type OutputSink = {
  stream: WriteStream;
  completion: Promise<void>;
};

export function createOutputSink(path: string): OutputSink {
  const stream = createWriteStream(path, { encoding: "utf8", flags: "wx" });
  const completion = finished(stream);
  void completion.catch(() => undefined);

  return { stream, completion };
}

export async function writeLine(output: OutputSink, line: string): Promise<void> {
  if (!output.stream.write(`${line}\n`)) await Promise.race([once(output.stream, "drain"), output.completion]);
}

export async function writeBlock(
  output: OutputSink,
  block: BufferedBlock,
  preserveOwner: boolean,
  strippedOwnerStatements: { count: number },
): Promise<void> {
  await writeLine(output, "--");

  for (const line of block.lines) {
    if (!preserveOwner && isOwnerStatement(line)) {
      strippedOwnerStatements.count += 1;
      continue;
    }

    if (line.startsWith("\\restrict ") || line.startsWith("\\unrestrict ")) continue;

    await writeLine(output, line);
  }
}

export async function appendFileToOutput(path: string, output: OutputSink): Promise<void> {
  for await (const chunk of createReadStream(path)) {
    if (!output.stream.write(chunk)) await Promise.race([once(output.stream, "drain"), output.completion]);
  }
}

export async function destroyOutputSink(output: OutputSink): Promise<void> {
  output.stream.destroy();
  try {
    await output.completion;
  } catch (error: unknown) {
    void error;
  }
}
