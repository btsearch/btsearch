import type { ApiKey } from "@better-auth/api-key";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { z } from "zod/v4";

import type { ScopeResolver } from "../features/access/scope.js";
import type { ErrorBodies, ErrorReasons } from "../features/openapi/errorResponses.js";
import type { OAuthTokenContext } from "../plugins/auth/oauthToken.js";
import type { RoutePermission } from "../plugins/auth/permissions.js";
import type { auth } from "../plugins/betterauth.plugin.js";
import type { TokenTier } from "./auth.interface.js";

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type ApiToken = Omit<
  ApiKey,
  "key" | "refillInterval" | "refillAmount" | "lastRefillAt" | "rateLimitEnabled" | "requestCount" | "remaining"
> | null;

export type FastifyZodInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;

declare module "fastify" {
  export interface FastifyInstance {
    auth: { handler: (request: Request) => Promise<Response> } | ((request: Request) => Promise<Response>);
  }

  export interface FastifyRequest {
    requestStartTime: bigint;
    apiToken: ApiToken;
    oauthToken: OAuthTokenContext | null;
    publishableKey: { id: string; name: string | null; tier: TokenTier } | null;
    userSession: Session | null;
  }

  export interface FastifyContextConfig {
    permissions?: RoutePermission[];
    permissionsCheckedByHandler?: RoutePermission[];
    scope?: ScopeResolver;
    allowGuestAccess?: boolean;
    retainIdempotencyKey?: boolean;
    multipartBody?: z.ZodType;
    errorReasons?: ErrorReasons;
    errorBodies?: ErrorBodies;
  }
}

export type ReplyPayload<Payload extends RouteGenericInterface> = Omit<
  FastifyReply<RouteGenericInterface, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, Payload>,
  "send"
> & {
  send: (payload: Payload["Reply"]) => FastifyReply;
  status: (statusCode: number) => {
    send: (payload: Payload["Reply"]) => FastifyReply;
  };
};
