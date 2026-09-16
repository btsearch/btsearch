import { hash } from "@node-rs/argon2";
import * as schema from "@openbts/drizzle";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ARGON2_OPTIONS } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { redis } from "../../../../database/redis.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { passkeyVerifiedKey } from "../../../../plugins/auth/hooks.js";

const schemaRoute = {
  body: z.object({
    newPassword: z.string().min(8).max(128),
  }),
};

type ReqBody = { Body: z.infer<typeof schemaRoute.body> };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<EmptyResponse>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const verifiedKey = passkeyVerifiedKey(session.user.id);
  const isVerified = await redis.get(verifiedKey);
  if (!isVerified) throw new ErrorResponse("FORBIDDEN", { message: "Passkey verification required to set a password." });

  const existingAccount = await db.query.accounts.findFirst({
    where: { AND: [{ userId: session.user.id }, { providerId: "credential" }] },
    columns: { id: true },
  });
  if (existingAccount) throw new ErrorResponse("BAD_REQUEST", { message: "Account already has a password. Use the change password flow instead." });

  const hashedPassword = await hash(req.body.newPassword, ARGON2_OPTIONS);
  await db.insert(schema.accounts).values({
    userId: session.user.id,
    accountId: session.user.id,
    providerId: "credential",
    password: hashedPassword,
  });

  await redis.del(verifiedKey);

  return res.status(204).send();
}

const postAccountPassword: Route<ReqBody, void> = {
  url: "/account/password",
  method: "POST",
  schema: schemaRoute,
  handler,
};

export default postAccountPassword;
