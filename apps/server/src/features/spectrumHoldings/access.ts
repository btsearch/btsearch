import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { getCountryReach } from "../access/staff.js";
import { isWithinReach } from "../audit/access.js";

type HoldingAction = "create" | "update" | "delete";

const OTHER_COUNTRY_MESSAGE = "Only a maintainer of this country or an administrator can change its spectrum holdings";

export async function assertManagesHoldings(req: FastifyRequest, action: HoldingAction, countryCode: string): Promise<void> {
  const reach = await getCountryReach(req, { spectrum_holdings: [action] });
  if (!isWithinReach(reach, countryCode)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: OTHER_COUNTRY_MESSAGE });
}
