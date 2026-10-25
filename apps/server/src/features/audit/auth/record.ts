import type { GenericEndpointContext } from "better-auth";
import { isIP } from "node:net";

import { logger } from "../../../utils/logger.js";
import type { AuditContext } from "../context.js";
import { runAuditedOperation } from "../operation.js";
import type { AuthEvent } from "./events.js";

const MAX_IP_LENGTH = 60;

function clientAddress(headers: Headers | undefined): string | null {
  const address = headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip")?.trim();
  return address !== undefined && address.length <= MAX_IP_LENGTH && isIP(address) !== 0 ? address : null;
}

export function requestAuditContext(headers: Headers | undefined, actorId: string | null, performedBy = actorId): AuditContext {
  return {
    actorId,
    performedBy,
    source: headers === undefined ? "system" : "api",
    ipAddress: clientAddress(headers),
    userAgent: headers?.get("user-agent") ?? null,
    clientKey: null,
    clientKind: null,
  };
}

export function authAuditContext(ctx: GenericEndpointContext, actorId: string | null): AuditContext {
  const impersonatedBy: unknown = ctx.context.session?.session.impersonatedBy;
  const headers = (ctx.request as Request | undefined)?.headers ?? ctx.headers;
  return requestAuditContext(headers, actorId, typeof impersonatedBy === "string" ? impersonatedBy : actorId);
}

export async function recordAuthEvent(
  path: string,
  context: AuditContext,
  describe: () => AuthEvent | null | Promise<AuthEvent | null>,
): Promise<void> {
  try {
    const event = await describe();
    if (event === null || event.entries.length === 0) return;

    await runAuditedOperation(context, { kind: event.kind }, (_tx, audit) => audit.logMany(event.entries));
  } catch (error) {
    logger.error("auth.audit", { path, actorId: context.actorId, error });
  }
}
