import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { type CountryReach, getCountryReach } from "../access/staff.js";
import type { AuditOperationSummary } from "./types.js";

type AuditAction = "read" | "revert";

export type AuditReach = CountryReach;

export function getAuditReach(req: FastifyRequest, action: AuditAction): Promise<AuditReach> {
  return getCountryReach(req, { audit_operations: [action] });
}

export async function assertAuditReach(req: FastifyRequest, action: AuditAction): Promise<AuditReach> {
  const reach = await getAuditReach(req, action);
  if (!reach.isEverywhere && reach.countryCodes.length === 0) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  return reach;
}

export function isWithinReach(reach: AuditReach, countryCode: string | null): boolean {
  return reach.isEverywhere || (countryCode !== null && reach.countryCodes.includes(countryCode));
}

export function countriesWithinReach(reach: AuditReach, requested: readonly string[] | undefined): readonly string[] | undefined {
  if (reach.isEverywhere) return requested;
  return requested === undefined ? reach.countryCodes : reach.countryCodes.filter((code) => requested.includes(code));
}

export function redactForReach<T extends AuditOperationSummary>(reach: AuditReach, operation: T): T {
  return reach.isEverywhere ? operation : { ...operation, ip_address: null, user_agent: null };
}
