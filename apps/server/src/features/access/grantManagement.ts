import type { GrantRole } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { findRoleGrant } from "./roleGrants.js";
import { type CountryReach, getCountryReach } from "./staff.js";

type GrantAction = "create" | "update" | "delete";
type ManagedGrant = { countryCode: string; role: GrantRole };

const MAINTAINER_GRANT_MESSAGE = "Only an administrator can appoint or remove a maintainer";
const OTHER_COUNTRY_MESSAGE = "Only a maintainer of this country or an administrator can manage its editors";

function assertReachCoversGrant(reach: CountryReach, grant: ManagedGrant): void {
  if (reach.isEverywhere) return;
  if (grant.role === "maintainer") throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: MAINTAINER_GRANT_MESSAGE });
  if (!reach.countryCodes.includes(grant.countryCode)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: OTHER_COUNTRY_MESSAGE });
}

export async function assertManagesGrant(req: FastifyRequest, action: GrantAction, grant: ManagedGrant): Promise<void> {
  assertReachCoversGrant(await getCountryReach(req, { role_grants: [action] }), grant);
}

export async function assertManagesStoredGrant(req: FastifyRequest, action: GrantAction, grantId: string): Promise<void> {
  const reach = await getCountryReach(req, { role_grants: [action] });
  if (!reach.isEverywhere && reach.countryCodes.length === 0) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  assertReachCoversGrant(reach, await findRoleGrant(grantId));
}
