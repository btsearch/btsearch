import { isSnapshotRecord } from "./revert/columns.js";
import type { AuditMetadata } from "./types.js";

export function toAuditMetadata(value: unknown): AuditMetadata | null {
  return isSnapshotRecord(value) ? value : null;
}
