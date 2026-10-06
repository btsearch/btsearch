import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { canSeeCountry } from "../access/access.js";
import { assertTokenScope, hasStaffPermission, sessionOrTokenAccessFromRequest } from "../access/staff.js";
import type { StructureOwnerRow } from "./serialize.js";

type NewOwner = Pick<StructureOwnerRow, "countryCode" | "brandId" | "operatorId">;

const ADMIN_ONLY_OWNER_MESSAGE = "Only an administrator can create a structure owner without a country, or with a brand or an operator";
const OTHER_COUNTRY_MESSAGE = "Only an editor of this country or an administrator can create its structure owners";

export async function assertCanCreateStructureOwner(req: FastifyRequest, { countryCode, brandId, operatorId }: NewOwner): Promise<void> {
  if (await hasStaffPermission(req, { structure_owners: ["create"] })) return;

  assertTokenScope(req, "create:structure_owners");
  const access = await sessionOrTokenAccessFromRequest(req);
  if (access?.role !== "editor") throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  if (countryCode === null || brandId !== null || operatorId !== null) {
    throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: ADMIN_ONLY_OWNER_MESSAGE });
  }
  if (!canSeeCountry(access, countryCode)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: OTHER_COUNTRY_MESSAGE });
}
