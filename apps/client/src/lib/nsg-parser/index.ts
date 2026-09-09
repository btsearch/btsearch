import { isValidLatLng } from "./internal/coordinates";
import { StreamDecoder } from "./internal/streamDecoder";
import { convertNsgTimestampUsToMs, formatNsgTimestamp, parseNsgTimestampMs, parseNsgTimestampUs } from "./internal/timestamp";
import type { NsgLog, NsgParseInput, NsgParseOptions } from "./model";

export { convertNsgTimestampUsToMs, formatNsgTimestamp, isValidLatLng, parseNsgTimestampMs, parseNsgTimestampUs };
export type { NsgLog, NsgParseInput, NsgParseMode, NsgParseOptions, NsgProgress, NsgSource } from "./model";

export async function parseNsg({ stream, source }: NsgParseInput, options: NsgParseOptions = {}): Promise<NsgLog> {
  const decoder = new StreamDecoder(source, {
    mode: options.mode,
    allowIncompleteFinalRecord: options.allowIncompleteFinalRecord,
    onCell: options.onCell,
    onEvent: options.onEvent,
  });
  const { onProgress } = options;
  const reader = stream.getReader();
  let lastProgress = 0;
  try {
    onProgress?.(decoder.progress());
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Read each chunk in order without buffering the complete log.
      const { value, done } = await reader.read();
      if (done) break;
      decoder.push(value);
      const now = performance.now();
      if (now - lastProgress >= 100) {
        onProgress?.(decoder.progress());
        lastProgress = now;
      }
    }
    const log = decoder.finish();
    onProgress?.(decoder.progress());
    return log;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
