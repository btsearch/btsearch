import type { ApiKey } from "@better-auth/api-key";
import type { DescMessage } from "@bufbuild/protobuf";
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

import type { auth } from "../plugins/betterauth.plugin.js";
import type { OAuthTokenContext } from "../services/oauthToken.service.js";
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
    permissions?: string[];
    allowGuestAccess?: boolean;
    proto?: DescMessage;
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
