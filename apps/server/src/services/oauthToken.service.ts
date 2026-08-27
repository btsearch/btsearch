import { createHash } from "node:crypto";

import { db } from "../database/psql.js";
import type { Session } from "../interfaces/fastify.interface.js";

export type OAuthTokenContext = {
  clientId: string;
  scopes: string[];
  userId: string;
};

const OPAQUE_ACCESS_TOKEN_PREFIX = "oat_";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function isOAuthBearerToken(token: string) {
  return token.startsWith(OPAQUE_ACCESS_TOKEN_PREFIX);
}

export async function verifyOAuthAccessToken(bearerToken: string): Promise<{ userSession: Session; token: OAuthTokenContext } | null> {
  const rawToken = bearerToken.slice(OPAQUE_ACCESS_TOKEN_PREFIX.length);
  if (!rawToken) return null;

  const accessToken = await db.query.oauthAccessTokens.findFirst({
    where: { token: hashToken(rawToken) },
  });
  if (!accessToken?.userId) return null;
  if (accessToken.revoked) return null;
  if (accessToken.expiresAt.getTime() <= Date.now()) return null;

  const [session, user] = await Promise.all([
    accessToken.sessionId ? db.query.sessions.findFirst({ where: { id: accessToken.sessionId } }) : Promise.resolve(undefined),
    db.query.users.findFirst({ where: { id: accessToken.userId } }),
  ]);
  if (accessToken.sessionId && (!session || session.expiresAt.getTime() <= Date.now())) return null;
  if (!user) return null;
  if (user.banned && (!user.banExpires || user.banExpires.getTime() > Date.now())) return null;

  const userSession = {
    session: session
      ? { ...session, userId: accessToken.userId }
      : {
          id: accessToken.id,
          token: "",
          userId: accessToken.userId,
          expiresAt: accessToken.expiresAt,
          createdAt: accessToken.createdAt,
          updatedAt: accessToken.createdAt,
        },
    user,
  } as unknown as Session;

  return {
    userSession,
    token: {
      clientId: accessToken.clientId,
      scopes: accessToken.scopes ?? [],
      userId: accessToken.userId,
    },
  };
}

export function hasRequiredScopes(token: OAuthTokenContext, routePermissions: string[] | undefined) {
  if (!routePermissions?.length) return true;
  return routePermissions.every((permission) => token.scopes.includes(permission));
}
