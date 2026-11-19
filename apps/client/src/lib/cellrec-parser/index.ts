import type { NsgLog, NsgProgress } from "../nsg-parser/model";
import { type CellrecProblem, type CellrecRecord, decodeRecords, isIndexBlock, readFileHeader, readPayload, walkBlocks } from "./internal/container";
import { type CellrecBuildOptions, type CellrecSource, buildExplorerLog } from "./internal/explorerLog";

const PROGRESS_INTERVAL_MS = 100;
const MAX_PARSING_PERCENT = 99;

export type { CellrecSource } from "./internal/explorerLog";
export type CellrecParseOptions = CellrecBuildOptions & { onProgress?: (progress: NsgProgress) => void };

export function parseCellrec(bytes: Uint8Array, source: CellrecSource, options: CellrecParseOptions = {}): NsgLog {
  const header = readFileHeader(bytes);
  const problems: CellrecProblem[] = [];
  const records: CellrecRecord[] = [];
  let payloadBytes = 0;
  let reportedAt = 0;

  for (const block of walkBlocks(bytes, header.dataOffset, problems)) {
    if (isIndexBlock(block)) continue;
    const payload = readPayload(bytes, block, problems);
    if (payload !== null) {
      payloadBytes += payload.length;
      for (const record of decodeRecords(payload, block, problems)) records.push(record);
    }
    const now = Date.now();
    if (options.onProgress && now - reportedAt >= PROGRESS_INTERVAL_MS) {
      reportedAt = now;
      options.onProgress({
        bytesRead: block.end,
        totalBytes: bytes.length,
        percent: Math.min(MAX_PARSING_PERCENT, Math.floor((block.end / bytes.length) * 100)),
        recordCount: records.length,
        eventCount: 0,
        cellCount: 0,
      });
    }
  }

  return buildExplorerLog({ source, header, records, problems, payloadBytes }, options);
}
