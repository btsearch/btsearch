import type { MeasurementListScope } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { hasStaffPermission } from "../access/staff.js";

const managerChecks = new WeakMap<FastifyRequest, Promise<boolean>>();

export function canManageMeasurements(req: FastifyRequest): Promise<boolean> {
  const known = managerChecks.get(req);
  if (known !== undefined) return known;

  const check = hasStaffPermission(req, { observations: ["manage"] });
  managerChecks.set(req, check);
  return check;
}

export async function coversEveryone(req: FastifyRequest, scope: MeasurementListScope | undefined, hasIdFilters: boolean): Promise<boolean> {
  if (scope === "mine" || (scope === undefined && !hasIdFilters)) return false;
  const canManage = await canManageMeasurements(req);
  if (scope === "all" && !canManage) throw new ErrorResponse("FORBIDDEN", { message: "Only an administrator can send `scope=all`" });
  return canManage;
}
