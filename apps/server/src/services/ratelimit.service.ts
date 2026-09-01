import type { FastifyRequest } from "fastify";

import type { redis } from "../database/redis.js";
import type { TokenTier, UserRole } from "../interfaces/auth.interface.js";
import { generateFingerprint } from "../utils/fingerprint.js";
import { logger } from "../utils/logger.js";

export type RateLimitTier = {
  max: number;
  window: number;
};

export type RouteRateLimit = {
  url: string;
  max: number;
  window: number;
  countSuccessfulOnly?: boolean;
  roles?: Partial<Record<UserRole, RateLimitTier>>;
};

export interface RateLimitOptions {
  window?: number;
  max?: number;
  tiers?: Partial<Record<TokenTier, RateLimitTier>>;
  roles?: Partial<Record<UserRole, RateLimitTier>>;
  routes?: RouteRateLimit[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: number;
  retryAfter?: number;
  reservation?: RateLimitReservation;
}

export interface RateLimitReservation {
  key: string;
}

type RateLimitCheckOptions = {
  countSuccessfulOnly?: boolean;
};

export const DEFAULT_TIER_LIMITS: Required<NonNullable<RateLimitOptions["tiers"]>> = {
  basic: { max: 60, window: 60 },
  pro: { max: 600, window: 60 },
  unlimited: { max: Number.POSITIVE_INFINITY, window: 60 },
};

export const DEFAULT_PK_TIER_LIMITS: Record<string, RateLimitTier> = {
  basic: { max: 120, window: 60 },
  pro: { max: 600, window: 60 },
  unlimited: { max: Number.POSITIVE_INFINITY, window: 60 },
};

export const DEFAULT_IP_LIMIT: RateLimitTier = { max: 20, window: 300 };

export class RateLimitService {
  private redis: typeof redis;
  private prefix = "ratelimit:";

  private defaultTiers = DEFAULT_TIER_LIMITS;

  private defaultRoles: Required<NonNullable<RateLimitOptions["roles"]>> = {
    guest: { max: 60, window: 60 },
    user: { max: 250, window: 60 },
    editor: { max: 500, window: 60 },
    admin: { max: Number.POSITIVE_INFINITY, window: 60 },
  };

  private defaultOptions: Required<RateLimitOptions> = {
    window: 60,
    max: 60,
    tiers: this.defaultTiers,
    roles: this.defaultRoles,
    routes: [],
  };

  private options: Required<RateLimitOptions>;

  /**
   * Create a new RateLimitService instance
   * @param redisClient Redis client instance
   * @param options Rate limit configuration options
   */
  constructor(redisClient: typeof redis, options: Partial<RateLimitOptions> = {}) {
    this.redis = redisClient;

    this.options = {
      ...this.defaultOptions,
      ...options,
      tiers: { ...this.defaultOptions.tiers, ...options.tiers },
      roles: { ...this.defaultOptions.roles, ...options.roles },
      routes: options.routes ?? this.defaultOptions.routes,
    };
  }

  /**
   * Generate a rate limit key based on the request
   * @param req FastifyRequest object
   * @param useRouteKey Whether to include the route in the key
   * @returns Rate limit key or null if fingerprint generation fails
   */
  generateKey(req: FastifyRequest, useRouteKey = false): string | null {
    const route = useRouteKey ? (req.routeOptions.url ?? req.url ?? "unknown").split("?")[0] : "";

    if (req.apiToken) {
      const tokenId = req.apiToken.id;
      return `${this.prefix}api:${tokenId}${useRouteKey ? `:${route}` : ""}`;
    }

    if (req.userSession) {
      const userId = req.userSession.user.id;
      return `${this.prefix}user:${userId}${useRouteKey ? `:${route}` : ""}`;
    }

    if (req.publishableKey) {
      const keyId = req.publishableKey.id;
      return `${this.prefix}pk:${keyId}${useRouteKey ? `:${route}` : ""}`;
    }

    const fingerprint = generateFingerprint(req);
    if (fingerprint) return `${this.prefix}unauth:${fingerprint}${useRouteKey ? `:${route}` : ""}`;

    const ip = req.ip;
    if (ip && ip !== "unknown") return `${this.prefix}ip:${ip}${useRouteKey ? `:${route}` : ""}`;

    return null;
  }

  /**
   * Get API key rate limit settings
   * @param apiKeyId API key ID
   * @returns Rate limit configuration or null if not found
   */
  private async getApiKeyRateLimit(req: FastifyRequest): Promise<RateLimitTier | null> {
    try {
      const result = req.apiToken;
      if (!result) return null;

      if (result.metadata) {
        const tier = result.metadata.tier as TokenTier;
        const tierLimit = this.options.tiers[tier];
        if (tierLimit) return tierLimit;
      }

      return this.defaultTiers.basic;
    } catch (error) {
      logger.error("ratelimit.service.getApiKeyRateLimit", { error });
      return null;
    }
  }

  /**
   * Get route-specific rate limit if configured
   * @param req FastifyRequest object
   * @returns Rate limit configuration for the route or null if not found
   */
  private getRouteRateLimit(req: FastifyRequest): RouteRateLimit | null {
    const url = (req.url ?? req.routeOptions?.url ?? "").split("?")[0];
    if (!url || !this.options.routes.length) return null;

    return (
      this.options.routes.find((route) => {
        if (route.url === url) return true;

        const routeParts = route.url.split("/");
        const urlParts = url.split("/");

        if (routeParts.length !== urlParts.length) return false;

        return routeParts.every((part, i) => {
          if (part.startsWith(":") || part.startsWith("*")) return true;
          return part === urlParts[i];
        });
      }) ?? null
    );
  }

  /**
   * Determine the appropriate rate limit tier for a request
   * @param req FastifyRequest object
   * @returns Rate limit configuration for the request
   */
  async getRateLimitTier(req: FastifyRequest): Promise<RateLimitTier> {
    const routeConfig = this.getRouteRateLimit(req);
    if (routeConfig) {
      if (routeConfig.roles && req.userSession?.user?.role) {
        const role = req.userSession.user.role as UserRole;
        const roleLimit = routeConfig.roles[role];
        if (roleLimit) return roleLimit;
      }
      return { max: routeConfig.max, window: routeConfig.window };
    }

    if (req.apiToken) {
      const apiKeyRateLimit = await this.getApiKeyRateLimit(req);
      if (apiKeyRateLimit) return apiKeyRateLimit;
    }

    if (req.publishableKey) return DEFAULT_PK_TIER_LIMITS[req.publishableKey.tier] ?? (DEFAULT_PK_TIER_LIMITS.basic as RateLimitTier);

    if (req.userSession?.user) {
      if (req.userSession.user.role) {
        const role = req.userSession.user.role as UserRole;
        const roleLimit = this.options.roles[role];
        return roleLimit ?? this.options.roles.user ?? { max: this.options.max, window: this.options.window };
      }

      return this.options.roles.user ?? { max: this.options.max, window: this.options.window };
    }

    if (!generateFingerprint(req)) return DEFAULT_IP_LIMIT;

    const guestLimit = this.options.roles.guest;
    return guestLimit ?? { max: this.options.max, window: this.options.window };
  }

  /**
   * Check if a request is within rate limits
   * @param key Rate limit key
   * @param rateLimit Rate limit configuration
   * @returns Rate limit check result
   */
  async check(key: string, rateLimit: RateLimitTier, options: RateLimitCheckOptions = {}): Promise<RateLimitResult> {
    if (rateLimit.max === Number.POSITIVE_INFINITY) {
      return {
        allowed: true,
        remaining: Number.POSITIVE_INFINITY,
        limit: Number.POSITIVE_INFINITY,
        reset: Math.floor(Date.now() / 1000) + rateLimit.window,
      };
    }

    const [newCount, ttlResult] = (await this.redis.multi().incr(key).ttl(key).exec()) as unknown as [number, number];
    if (newCount === 1) await this.redis.expire(key, rateLimit.window);

    const ttl = newCount === 1 ? rateLimit.window : ttlResult > 0 ? ttlResult : rateLimit.window;
    const resetTime = Math.floor(Date.now() / 1000) + ttl;

    if (newCount > rateLimit.max) {
      if (options.countSuccessfulOnly) await this.release({ key });

      return {
        allowed: false,
        remaining: 0,
        limit: rateLimit.max,
        reset: resetTime,
        retryAfter: ttl,
      };
    }

    const result: RateLimitResult = {
      allowed: true,
      remaining: rateLimit.max - newCount,
      limit: rateLimit.max,
      reset: resetTime,
    };
    if (options.countSuccessfulOnly) result.reservation = { key };

    return result;
  }

  async release(reservation: RateLimitReservation): Promise<void> {
    try {
      const count = await this.redis.decr(reservation.key);
      if (count <= 0) await this.redis.del(reservation.key);
    } catch (err) {
      logger.error("ratelimit.service.release", { err });
    }
  }

  /**
   * Process rate limiting for a request
   * @param req FastifyRequest object
   * @returns Rate limit check result or null if rate limiting should be skipped
   */
  async processRequest(req: FastifyRequest): Promise<RateLimitResult | null> {
    try {
      const rateLimit = await this.getRateLimitTier(req);

      const routeLimit = this.getRouteRateLimit(req);
      const useRouteKey = routeLimit !== null;

      const key = this.generateKey(req, useRouteKey);
      if (!key) return null;

      return await this.check(key, rateLimit, { countSuccessfulOnly: routeLimit?.countSuccessfulOnly === true });
    } catch (err) {
      logger.error("ratelimit.service.processRequest", { err });
      return null;
    }
  }

  /**
   * Update service options
   * @param options New rate limit options
   */
  updateOptions(options: Partial<RateLimitOptions>): void {
    this.options = {
      ...this.options,
      ...options,
      tiers: { ...this.options.tiers, ...options.tiers },
      roles: { ...this.options.roles, ...options.roles },
      routes: options.routes ?? this.options.routes,
    };
  }
}
