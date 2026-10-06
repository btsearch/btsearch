import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { assertTokenScope } from "../access/staff.js";

export function accountOwnerId(req: FastifyRequest): string {
  assertTokenScope(req, "profile");

  const userId = req.userSession?.user?.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");
  return userId;
}
