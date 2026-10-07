import type { FastifyRequest } from "fastify";

import type { redis } from "../../database/redis.js";
import type { TokenTier, UserRole } from "../../interfaces/auth.interface.js";
import { generateFingerprint } from "../../utils/fingerprint.js";
import { logger } from "../../utils/logger.js";
import { CounterPausedError, hitCounter } from "./counter.js";

export type QuotaTier = {
  max: number;
  window: number;
};

export interface QuotaOptions {
  window?: number;
  max?: number;
  tiers?: Partial<Record<TokenTier, QuotaTier>>;
  roles?: Partial<Record<UserRole, QuotaTier>>;
}

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: number;
  retryAfter?: number;
}

const WEEK_IN_SECONDS = 604800;

export const DEFAULT_QUOTA_LIMITS: Required<NonNullable<QuotaOptions["tiers"]>> = {
  basic: { max: 10000, window: WEEK_IN_SECONDS },
  pro: { max: 100000, window: WEEK_IN_SECONDS },
  unlimited: { max: Number.POSITIVE_INFINITY, window: WEEK_IN_SECONDS },
};

export class QuotaService {
  private redis: typeof redis;
  private prefix = "quota:";

  private defaultTiers = DEFAULT_QUOTA_LIMITS;

  private defaultRoles: Required<NonNullable<QuotaOptions["roles"]>> = {
    guest: { max: 1000, window: WEEK_IN_SECONDS },
    user: { max: 10000, window: WEEK_IN_SECONDS },
    editor: { max: 50000, window: WEEK_IN_SECONDS },
    admin: { max: Number.POSITIVE_INFINITY, window: WEEK_IN_SECONDS },
  };

  private defaultOptions: Required<QuotaOptions> = {
    window: WEEK_IN_SECONDS,
    max: 10000,
    tiers: this.defaultTiers,
    roles: this.defaultRoles,
  };

  private options: Required<QuotaOptions>;

  constructor(redisClient: typeof redis, options: Partial<QuotaOptions> = {}) {
    this.redis = redisClient;

    this.options = {
      ...this.defaultOptions,
      ...options,
      tiers: { ...this.defaultOptions.tiers, ...options.tiers },
      roles: { ...this.defaultOptions.roles, ...options.roles },
    };
  }

  generateKey(req: FastifyRequest): string | null {
    if (req.apiToken) {
      return `${this.prefix}api:${req.apiToken.id}`;
    }

    if (req.userSession) {
      return `${this.prefix}user:${req.userSession.user.id}`;
    }

    const fingerprint = generateFingerprint(req);
    if (!fingerprint) return null;
    return `${this.prefix}unauth:${fingerprint}`;
  }

  private getApiKeyQuota(req: FastifyRequest): QuotaTier | null {
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
      logger.error("quota.service.getApiKeyQuota", { error });
      return null;
    }
  }

  async getQuotaTier(req: FastifyRequest): Promise<QuotaTier> {
    if (req.apiToken) {
      const apiKeyQuota = this.getApiKeyQuota(req);
      if (apiKeyQuota) return apiKeyQuota;
    }

    if (req.userSession?.user) {
      if (req.userSession.user.role) {
        const role = req.userSession.user.role as UserRole;
        const roleLimit = this.options.roles[role];
        return roleLimit ?? this.options.roles.user ?? { max: this.options.max, window: this.options.window };
      }

      return this.options.roles.user ?? { max: this.options.max, window: this.options.window };
    }

    const guestLimit = this.options.roles.guest;
    return guestLimit ?? { max: this.options.max, window: this.options.window };
  }

  async check(key: string, quota: QuotaTier): Promise<QuotaResult> {
    if (quota.max === Number.POSITIVE_INFINITY) {
      return {
        allowed: true,
        remaining: Number.POSITIVE_INFINITY,
        limit: Number.POSITIVE_INFINITY,
        reset: Math.floor(Date.now() / 1000) + quota.window,
      };
    }

    const hit = await hitCounter(this.redis, key, quota.window);
    const newCount = hit.count;
    const ttl = Math.max(hit.ttl, 1);
    const resetTime = Math.floor(Date.now() / 1000) + ttl;

    if (newCount > quota.max) {
      return {
        allowed: false,
        remaining: 0,
        limit: quota.max,
        reset: resetTime,
        retryAfter: ttl,
      };
    }

    return {
      allowed: true,
      remaining: quota.max - newCount,
      limit: quota.max,
      reset: resetTime,
    };
  }

  async processRequest(req: FastifyRequest): Promise<QuotaResult | null> {
    try {
      if (!req.apiToken) return null;

      const quota = await this.getQuotaTier(req);
      const key = this.generateKey(req);
      if (!key) return null;

      return await this.check(key, quota);
    } catch (err) {
      if (!(err instanceof CounterPausedError)) logger.error("quota.service.processRequest", { err });
      return null;
    }
  }
}
