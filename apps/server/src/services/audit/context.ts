import { AUDIT_OPERATION_ID_HEADER, AUDIT_OPERATION_KIND_HEADER, CLIENT_SETTABLE_KINDS } from "@openbts/shared/audit";
import type { AuditSource, ClientSettableAuditOperationKind } from "@openbts/shared/audit";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";

export type AuditContext = {
  actorId: string | null;
  performedBy: string | null;
  source: AuditSource;
  ipAddress: string | null;
  userAgent: string | null;
  clientKey: string | null;
  clientKind: ClientSettableAuditOperationKind | null;
};

const clientKeySchema = z.uuid();
const clientKindSchema = z.enum(CLIENT_SETTABLE_KINDS);

function correlationHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation headers must contain one value" });
    return value[0];
  }
  return value;
}

function parseClientCorrelation(req: FastifyRequest): Pick<AuditContext, "clientKey" | "clientKind"> {
  const keyHeader = req.headers[AUDIT_OPERATION_ID_HEADER];
  const kindHeader = req.headers[AUDIT_OPERATION_KIND_HEADER];
  const keyPresent = keyHeader !== undefined;
  const kindPresent = kindHeader !== undefined;
  if (!keyPresent && !kindPresent) return { clientKey: null, clientKind: null };
  if (!keyPresent || !kindPresent) throw new ErrorResponse("BAD_REQUEST", { message: "Both audit operation headers must be provided together" });

  const rawKey = correlationHeader(keyHeader);
  const rawKind = correlationHeader(kindHeader);
  if (rawKey === undefined || rawKind === undefined) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid audit operation headers" });

  const key = clientKeySchema.safeParse(rawKey);
  const kind = clientKindSchema.safeParse(rawKind);
  if (!key.success || !kind.success) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid audit operation headers" });

  const performedBy = req.userSession?.user?.id ?? null;
  if (performedBy === null) throw new ErrorResponse("BAD_REQUEST", { message: "Correlated audit operations require an authenticated user session" });

  return { clientKey: key.data.toLowerCase(), clientKind: kind.data };
}

export function auditContextFromRequest(req: FastifyRequest, source: AuditSource = "api"): AuditContext {
  const actorId = req.userSession?.user?.id ?? null;
  const correlation = parseClientCorrelation(req);
  const rawUserAgent = req.headers["user-agent"];
  return {
    actorId,
    performedBy: actorId,
    source,
    ipAddress: req.ip ?? null,
    userAgent: Array.isArray(rawUserAgent) ? (rawUserAgent[0] ?? null) : (rawUserAgent ?? null),
    ...correlation,
  };
}

export function systemAuditContext(): AuditContext {
  return {
    actorId: null,
    performedBy: null,
    source: "system",
    ipAddress: null,
    userAgent: null,
    clientKey: null,
    clientKind: null,
  };
}
