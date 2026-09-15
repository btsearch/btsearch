import type { FastifyContextConfig, FastifyReply, FastifySchema } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import type { RouteGenericInterface } from "fastify/types/route.js";

import type { ReplyPayload } from "./fastify.interface.js";

export type Route<T extends RouteGenericInterface = RouteGenericInterface, U = unknown> = U extends void
  ? {
      url: string;
      method: string;
      handler: (req: FastifyRequest<T>, res: ReplyPayload<EmptyResponse>) => Promise<void> | void;
      onRequest?: ((req: FastifyRequest, res: FastifyReply, done: (err?: Error) => void) => void)[];
      config?: FastifyContextConfig;
      schema?: FastifySchema;
    }
  : {
      url: string;
      method: string;
      handler: (req: FastifyRequest<T>, res: ReplyPayload<JSONBody<U>>) => Promise<void> | void;
      onRequest?: ((req: FastifyRequest, res: FastifyReply, done: (err?: Error) => void) => void)[];
      config?: FastifyContextConfig;
      schema?: FastifySchema;
    };

export type JSONBody<T = void> = RouteGenericInterface & {
  Reply: Response<T>;
};

export type EmptyResponse = RouteGenericInterface & {
  Reply: Record<string, never>;
};

type Response<T> = T extends { data: unknown } ? T : DataResponse<T>;

interface DataResponse<T> {
  data: T;
}

export type IdParams = { Params: { id: number } };
