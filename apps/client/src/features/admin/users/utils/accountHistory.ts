import type { AuditOperation, UserRef } from "../types";

export function getOperationAuthor(operation: Pick<AuditOperation, "actor" | "performer">): UserRef | null {
  return operation.performer ?? operation.actor;
}
