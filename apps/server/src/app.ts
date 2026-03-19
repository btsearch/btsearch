import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import debug from "debug";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticServe from "@fastify/static";
import scalarReference from "@scalar/fastify-api-reference";
import type { $ZodIssue } from "zod/v4/core";
import { serializerCompiler, validatorCompiler, hasZodFastifySchemaValidationErrors, type ZodTypeProvider } from "fastify-type-provider-zod";

import { dlogger } from "./config.js";
import { APIv1Controller } from "./controllers/v1.controller.js";
import { OnRequestHook } from "./hooks/onRequest.hook.js";
import { OnSendHook } from "./hooks/onSend.hook.js";
import { PreHandlerHook } from "./hooks/preHandler.hook.js";
import { initRuntimeSettings } from "./services/settings.service.js";
import { redisReady } from "./database/redis.js";
import { ValidationError, type ErrorResponse } from "./errors.js";
import { registerRateLimit } from "./plugins/ratelimit.plugin.js";
import { logger, serializeError } from "./utils/logger.js";

import type { FastifyZodInstance } from "./interfaces/fastify.interface.js";

function flattenZodIssues(issues: $ZodIssue[], pathPrefix: string[] = []): { field: string; validationMessage: string }[] {
  return issues.flatMap((issue) => {
    const path = [...pathPrefix, ...issue.path.map(String)];
    if (issue.code === "invalid_union") {
      const branches = issue.errors.map((branchIssues) => flattenZodIssues(branchIssues, path));
      const best = branches.reduce<{ field: string; validationMessage: string }[]>((a, b) => (a.length <= b.length ? a : b), branches[0] ?? []);
      return best.length > 0 ? best : [{ field: path.join("/") || "unknown", validationMessage: "Invalid input" }];
    }
    return [{ field: path.join("/") || "unknown", validationMessage: issue.message }];
  });
}

export default class App {
  fastify: FastifyZodInstance;
  dlogger: debug.Debugger;

  constructor() {
    this.dlogger = dlogger.extend("app");
    this.fastify = Fastify({
      logger: false,
      trustProxy: true,
      genReqId: () => randomUUID(),
    }).withTypeProvider<ZodTypeProvider>();
    this.fastify.setValidatorCompiler(validatorCompiler);
    this.fastify.setSerializerCompiler(serializerCompiler);

    debug.enable("sakilabs/openbts:*");

    this.checkEnvironment();
    this.initHooks();
    this.initMiddlewares();
    this.initControllers();
  }

  private checkEnvironment(): void {
    const requiredEnvVars = ["DATABASE_URL"];
    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

    if (missingEnvVars.length > 0) throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  }

  private async initServices(): Promise<void> {
    await redisReady;
    await initRuntimeSettings();
  }

  private initHooks(): void {
    this.dlogger("Registering hooks");

    const requestStartTime = Symbol("requestStartTime");
    this.fastify.decorateRequest(requestStartTime, 0);
    this.fastify.addHook("onRequest", OnRequestHook);
    this.fastify.addHook("preHandler", PreHandlerHook);
    this.fastify.addHook("onSend", OnSendHook);
    registerRateLimit(this.fastify);
    this.fastify.setErrorHandler((error, req, res) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details = error.validation.flatMap(
          (issue: { instancePath: string; message: string; keyword: string; params?: { errors?: $ZodIssue[][] } }) => {
            const field = issue.instancePath.replace(/^\//, "") || "unknown";
            if (issue.keyword === "invalid_union" && issue.params?.errors?.length) {
              const prefix = field.split("/").filter(Boolean);
              const branches = issue.params.errors.map((branchIssues) => flattenZodIssues(branchIssues, prefix));
              const best = branches.reduce<{ field: string; validationMessage: string }[]>(
                (a, b) => (a.length <= b.length ? a : b),
                branches[0] ?? [],
              );
              return best.length > 0 ? best : [{ field, validationMessage: "Invalid input" }];
            }
            return [{ field, validationMessage: issue.message }];
          },
        );
        return res.status(400).send({
          errors: [{ code: "VALIDATION_ERROR", message: "Validation error", details }],
        });
      }

      const err = error as ErrorResponse | ValidationError;
      const statusCode = err.statusCode || 500;
      const message = err.message || "An internal server error occurred.";
      const code = err.code || "INTERNAL_SERVER_ERROR";

      if (statusCode !== 404 && statusCode !== 429) {
        logger.error(err.code, {
          ...serializeError(err),
          statusCode,
          code,
          method: req?.method,
          url: req?.url,
          ip: req?.ip,
          host: req?.hostname,
          reqId: req?.id,
          userId: req?.userSession?.user?.id ?? undefined,
          request: {
            query: req?.query,
            params: req?.params,
            headers: req?.headers ? { ...req.headers, cookie: undefined, "x-api-key": undefined } : undefined,
            body: req?.body,
          },
        });
      }

      const errorResponse: {
        errors: {
          code: string;
          message: string;
          details?: {
            field: string;
            validationMessage: string | undefined;
          }[];
        }[];
      } = {
        errors: [
          {
            code,
            message,
          },
        ],
      };
      if (err instanceof ValidationError && errorResponse.errors[0]) {
        errorResponse.errors[0].details = (err as ValidationError)?.details || [];
      }

      return res.status(statusCode).send(errorResponse);
    });
    this.fastify.setNotFoundHandler((_req, res) => {
      return res.status(404).send({ errors: [{ code: "NOT_FOUND", message: "The requested resource was not found." }] });
    });
  }

  private initMiddlewares(): void {
    this.dlogger("Registering middlewares");
    this.fastify
      .register(cors, {
        origin: (origin, cb) => {
          if (!origin) {
            cb(null, true);
            return;
          }

          const hostname = new URL(origin).hostname;
          const isLocalhost = process.env.NODE_ENV !== "production" && hostname === "localhost";
          if (isLocalhost || hostname === "btsearch.pl") {
            cb(null, true);
            return;
          }

          cb(new Error("CORS origin not allowed"), false);
        },
        credentials: true,
        allowedHeaders: ["content-type", "x-api-key", "authorization"],
        exposedHeaders: [
          "x-response-time",
          "x-ratelimit-limit",
          "x-ratelimit-remaining",
          "x-ratelimit-reset",
          "x-quota-limit",
          "x-quota-remaining",
          "x-quota-reset",
          "x-retry-after",
          "content-disposition",
        ],
        maxAge: 86400,
      })
      .register(import("@fastify/multipart"));
  }

  private initControllers(): void {
    this.dlogger("Registering controllers");
    this.fastify.register(scalarReference, {
      routePrefix: "/api/v1/docs",
      configuration: {
        title: "BTSearch API Documentation",
        url: "/api/v1/openapi.yaml",
      },
    });
    this.fastify.register(staticServe, {
      root: resolve(process.cwd(), "static"),
      prefix: "/",
      serve: false,
    });
    this.fastify.register(staticServe, {
      root: resolve(process.cwd(), "uploads"),
      prefix: "/uploads/",
      decorateReply: false,
    });
    this.fastify.get("/api/v1/openapi.yaml", (_req, res) => res.sendFile("openapi.yaml"));
    this.fastify.register(APIv1Controller, { prefix: "/api/v1" });
  }

  public async listen(port: number): Promise<void> {
    try {
      await this.initServices();
      await this.fastify.listen({ port, host: "0.0.0.0" });
      this.dlogger("Server is ready on port %d", port);
    } catch (err) {
      this.dlogger("Error starting server: %O", err);
      process.exit(1);
    }
  }
}
