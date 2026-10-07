import cors from "@fastify/cors";
import staticServe from "@fastify/static";
import { AUDIT_OPERATION_ID_HEADER, AUDIT_OPERATION_KIND_HEADER } from "@openbts/shared/audit";
import scalarReference from "@scalar/fastify-api-reference";
import debug from "debug";
import Fastify from "fastify";
import {
  type ZodFastifySchemaValidationError,
  type ZodTypeProvider,
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { $ZodIssue } from "zod/v4/core";

import { dlogger } from "./config.js";
import { OGImagesController } from "./controllers/seo/og-images.controller.js";
import { SEOPagesController } from "./controllers/seo/pages.controller.js";
import { SitemapController } from "./controllers/seo/sitemap.controller.js";
import { APIv1Controller } from "./controllers/v1.controller.js";
import { APIv2Controller } from "./controllers/v2.controller.js";
import { redisReady } from "./database/redis.js";
import { DetailedErrorResponse, ErrorResponse, ValidationError, callerFaultResponse } from "./errors.js";
import { recordRoutePattern } from "./features/settings/routeRules.js";
import { OnRequestHook } from "./hooks/onRequest.hook.js";
import { OnSendHook } from "./hooks/onSend.hook.js";
import { PreHandlerHook } from "./hooks/preHandler.hook.js";
import type { FastifyZodInstance } from "./interfaces/fastify.interface.js";
import { isFirstPartyOrigin } from "./lib/firstPartyOrigin.js";
import { getRuntimeSettings, initRuntimeSettings } from "./lib/runtimeSettings.js";
import { loadDisposableEmailBlocklist } from "./plugins/auth/disposableEmailBlocklist.js";
import { auth } from "./plugins/betterauth.plugin.js";
import { registerRateLimit } from "./plugins/ratelimit.plugin.js";
import { flushLogs, logger, serializeError } from "./utils/logger.js";

function missesOwnDiscriminator(issues: $ZodIssue[]): boolean {
  return issues.some((issue) => issue.code === "invalid_union" && issue.errors.length === 0 && issue.path.length === 1);
}

function namesAnotherAction(issues: $ZodIssue[]): boolean {
  return issues.some((issue) => issue.code === "invalid_value" && issue.path.length === 1 && issue.path[0] === "action");
}

function branchesOfSentShape(branches: $ZodIssue[][]): $ZodIssue[][] {
  if (!branches.some(missesOwnDiscriminator)) return branches;

  const sent = branches.filter((issues) => !missesOwnDiscriminator(issues) && !namesAnotherAction(issues));
  return sent.length > 0 ? sent : branches;
}

function flattenZodIssues(issues: $ZodIssue[], pathPrefix: string[] = []): { field: string; validationMessage: string }[] {
  return issues.flatMap((issue) => {
    const path = [...pathPrefix, ...issue.path.map(String)];
    if (issue.code === "invalid_union") {
      const branches = branchesOfSentShape(issue.errors).map((branchIssues) => flattenZodIssues(branchIssues, path));
      const best = branches.reduce<{ field: string; validationMessage: string }[]>((a, b) => (a.length <= b.length ? a : b), branches[0] ?? []);
      return best.length > 0 ? best : [{ field: path.join("/") || "unknown", validationMessage: "Invalid input" }];
    }
    return [{ field: path.join("/") || "unknown", validationMessage: issue.message }];
  });
}

const UPLOADED_SVG_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
const CORS_OPTIONS = {
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: [
    "content-type",
    "x-api-key",
    "authorization",
    "x-idempotency-key",
    AUDIT_OPERATION_ID_HEADER,
    AUDIT_OPERATION_KIND_HEADER,
    "accept",
  ],
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
};

function getUnionBranchIssues(params: unknown): $ZodIssue[][] | undefined {
  if (typeof params !== "object" || params === null || !("errors" in params)) return undefined;
  const errors = (params as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || !errors.every(Array.isArray)) return undefined;
  return errors as unknown as $ZodIssue[][];
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
    await loadDisposableEmailBlocklist();
  }

  private initHooks(): void {
    this.dlogger("Registering hooks");

    const requestStartTime = Symbol("requestStartTime");
    this.fastify.decorateRequest(requestStartTime, 0);
    this.fastify.addHook("onRequest", OnRequestHook);
    this.fastify.addHook("preHandler", PreHandlerHook);
    this.fastify.addHook("onSend", OnSendHook);
    this.fastify.addHook("onRoute", (route) => recordRoutePattern(route.url));
    registerRateLimit(this.fastify);
    this.fastify.setErrorHandler((error, req, res) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details = error.validation.flatMap((issue: ZodFastifySchemaValidationError) => {
          const field = issue.instancePath.replace(/^\//, "") || "unknown";
          const unionBranches = getUnionBranchIssues(issue.params);
          if (issue.keyword === "invalid_union" && unionBranches?.length) {
            const prefix = field.split("/").filter(Boolean);
            const branches = branchesOfSentShape(unionBranches).map((branchIssues) => flattenZodIssues(branchIssues, prefix));
            const best = branches.reduce<{ field: string; validationMessage: string }[]>((a, b) => (a.length <= b.length ? a : b), branches[0] ?? []);
            return best.length > 0 ? best : [{ field, validationMessage: "Invalid input" }];
          }
          return [{ field, validationMessage: issue.message ?? "Invalid input" }];
        });
        return res.status(400).send({
          errors: [{ code: "VALIDATION_ERROR", message: "Validation error", details }],
        });
      }

      const err = (callerFaultResponse(error) ?? error) as ErrorResponse | ValidationError;
      const statusCode = err.statusCode || 500;
      const isUnexpected = statusCode >= 500 && !(err instanceof ErrorResponse);
      const message = isUnexpected || !err.message ? "An internal server error occurred." : err.message;
      const code = err.code || "INTERNAL_SERVER_ERROR";

      if (code !== "UNAUTHORIZED" && code !== "MAINTENANCE_MODE" && statusCode !== 404 && statusCode !== 429) {
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
          details?: unknown[];
        }[];
      } = {
        errors: [
          {
            code,
            message,
          },
        ],
      };
      const responseError = errorResponse.errors[0];
      if (responseError && (err instanceof ValidationError || err instanceof DetailedErrorResponse)) responseError.details = err.details;

      if (code === "MAINTENANCE_MODE") res.header("Cache-Control", "no-store");
      return res.status(statusCode).send(errorResponse);
    });
    this.fastify.setNotFoundHandler((_req, res) => {
      return res.status(404).send({ errors: [{ code: "NOT_FOUND", message: "The requested resource was not found" }] });
    });
  }

  private initMiddlewares(): void {
    this.dlogger("Registering middlewares");
    this.fastify
      .register(cors, {
        delegator: (req, cb) => {
          const firstParty = isFirstPartyOrigin(req.headers.origin);
          cb(null, { ...CORS_OPTIONS, origin: firstParty ? true : "*", credentials: firstParty });
        },
      })
      .register(import("@fastify/multipart"));

    this.fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => done(null, body));
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
    this.fastify.register(scalarReference, {
      routePrefix: "/api/v2/docs",
      configuration: {
        title: "BTSearch API v2 Documentation",
        url: "/api/v2/openapi.json",
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
      maxAge: "365d",
      immutable: true,
      setHeaders: (reply, filePath) => {
        if (getRuntimeSettings().enforceAuthForAllRoutes) reply.header("Cache-Control", "private, max-age=31536000, immutable");
        if (!filePath.endsWith(".svg")) return;

        reply.header("Content-Security-Policy", UPLOADED_SVG_POLICY);
        reply.header("X-Content-Type-Options", "nosniff");
      },
    });
    this.fastify.get("/api/v1/openapi.yaml", (_req, res) => res.sendFile("openapi.yaml"));
    this.fastify.get("/.well-known/openid-configuration", async (_req, res) => res.send(await auth.api.getOpenIdConfig()));
    this.fastify.get("/.well-known/oauth-authorization-server", async (_req, res) => res.send(await auth.api.getOAuthServerConfig()));
    this.fastify.register(SitemapController);
    this.fastify.register(SEOPagesController);
    this.fastify.register(OGImagesController);
    this.fastify.register(APIv1Controller, { prefix: "/api/v1" });
    this.fastify.register(APIv2Controller, { prefix: "/api/v2" });
  }

  public async listen(port: number): Promise<void> {
    try {
      await this.initServices();
      await this.fastify.listen({ port, host: "0.0.0.0" });
      this.dlogger("Server is ready on port %d", port);
    } catch (err) {
      logger.error("server.start", { error: err });
      this.dlogger("Error starting server: %O", err);
      await flushLogs();
      process.exit(1);
    }
  }
}
