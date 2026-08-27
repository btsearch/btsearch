import { oauthAccessTokens, oauthConsents, oauthRefreshTokens } from "@openbts/drizzle";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({
    client_id: z.string().min(1).max(255),
  }),
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const userId = session.user.id;
  const { client_id } = req.params;

  const consent = await db.query.oauthConsents.findFirst({
    where: { clientId: client_id, userId },
    columns: { id: true },
  });
  if (!consent) throw new ErrorResponse("NOT_FOUND");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(oauthConsents).where(and(eq(oauthConsents.clientId, client_id), eq(oauthConsents.userId, userId)));
    await tx
      .update(oauthAccessTokens)
      .set({ revoked: now })
      .where(and(eq(oauthAccessTokens.clientId, client_id), eq(oauthAccessTokens.userId, userId), isNull(oauthAccessTokens.revoked)));
    await tx
      .update(oauthRefreshTokens)
      .set({ revoked: now })
      .where(and(eq(oauthRefreshTokens.clientId, client_id), eq(oauthRefreshTokens.userId, userId), isNull(oauthRefreshTokens.revoked)));
  });

  return res.status(204).send();
}

const deleteOAuthAuthorization: Route<ReqParams, void> = {
  url: "/account/oauth-authorizations/:client_id",
  method: "DELETE",
  schema: schemaRoute,
  handler,
};

export default deleteOAuthAuthorization;
