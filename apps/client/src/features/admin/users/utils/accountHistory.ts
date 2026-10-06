import type { AuditOperation, UserRef } from "../types";

export function getOperationAuthor(operation: Pick<AuditOperation, "actor" | "performer">): UserRef | null {
  return operation.performer ?? operation.actor;
}

export function findActiveBanOperation(accountHistory: readonly AuditOperation[]): AuditOperation | null {
  const latestBanChange = accountHistory.find((operation) => operation.kind === "user.ban" || operation.kind === "user.unban");
  return latestBanChange?.kind === "user.ban" ? latestBanChange : null;
}
