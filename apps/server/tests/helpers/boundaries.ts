import { type SQL, type SQLWrapper, getTableName, sql } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { type Mock, vi } from "vitest";

import type { Database } from "../../src/database/psql.js";
import type { Session } from "../../src/interfaces/fastify.interface.js";

export type DatabaseCall = {
  operation: string;
  table?: string;
  clauses: Record<string, unknown[]>;
  values?: unknown;
  selection?: unknown;
};
type ScriptedResult = { operation?: string; table?: string; result: unknown };
type QueryBoundary = {
  [Name in keyof Database["query"]]: {
    findFirst: Mock<(options?: unknown) => Promise<unknown>>;
    findMany: Mock<(options?: unknown) => Promise<unknown>>;
  };
};
const results: ScriptedResult[] = [];
const calls: DatabaseCall[] = [];
const queryTables: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

function tableName(table: unknown): string | undefined {
  if (typeof table !== "object" || table === null) return undefined;
  try {
    return getTableName(table as Table);
  } catch {
    return undefined;
  }
}

function consume(call: DatabaseCall): Promise<unknown> {
  calls.push(call);
  const matching = results.findIndex(
    (entry) => (entry.operation === undefined || entry.operation === call.operation) && (entry.table === undefined || entry.table === call.table),
  );
  if (matching < 0) return Promise.reject(new Error(`Unscripted database call: ${call.operation} ${call.table ?? ""}`));
  const entry = results.splice(matching, 1)[0];
  if (entry?.result instanceof Error) return Promise.reject(entry.result);
  return Promise.resolve(entry?.result);
}

function chain(operation: string, table?: unknown, selection?: unknown): Record<string, unknown> {
  const call: DatabaseCall = { operation, table: tableName(table), clauses: {}, selection };
  let pending: Promise<unknown> | undefined;
  const target: Record<string, unknown> = {};
  const builder = new Proxy(target, {
    get(_target, property) {
      if (property === "then")
        return (fulfilled: (result: unknown) => unknown, rejected?: (error: unknown) => unknown) => {
          pending ??= consume(call);
          return pending.then(fulfilled, rejected);
        };
      if (property === "catch") return (rejected: (error: unknown) => unknown) => (pending ??= consume(call)).catch(rejected);
      if (property === "getSQL")
        return (): SQL => {
          const projection = typeof selection === "object" && selection !== null ? Object.values(selection) : [];
          const selected =
            projection.length > 0
              ? sql.join(
                  projection.map((column) => sql`${column as SQLWrapper}`),
                  sql`, `,
                )
              : sql`*`;
          const source = call.clauses.from?.[0];
          const where = call.clauses.where?.[0];
          return sql`select ${selected}${source ? sql` from ${source as SQLWrapper}` : sql``}${where ? sql` where ${where as SQLWrapper}` : sql``}`;
        };
      if (property === Symbol.toStringTag) return "DatabaseBoundaryQuery";
      return (...args: unknown[]) => {
        const name = String(property);
        call.clauses[name] = args;
        if (name === "from") call.table = tableName(args[0]);
        if (name === "values" || name === "set") call.values = args[0];
        return builder;
      };
    },
  });
  return builder;
}

const query = new Proxy(queryTables, {
  get(target, name: string) {
    return (target[name] ??= {
      findFirst: vi.fn<(options?: unknown) => Promise<unknown>>(() => Promise.reject(new Error(`Unscripted database query: ${name}.findFirst`))),
      findMany: vi.fn<(options?: unknown) => Promise<unknown>>(() => Promise.reject(new Error(`Unscripted database query: ${name}.findMany`))),
    });
  },
}) as unknown as QueryBoundary;

export const dbMock = {
  calls,
  query,
  select: vi.fn((selection?: unknown) => chain("select", undefined, selection)),
  selectDistinct: vi.fn((selection?: unknown) => chain("select", undefined, selection)),
  insert: vi.fn((table: unknown) => chain("insert", table)),
  update: vi.fn((table: unknown) => chain("update", table)),
  delete: vi.fn((table: unknown) => chain("delete", table)),
  execute: vi.fn((statement: unknown) => consume({ operation: "execute", clauses: { statement: [statement] } })),
  $count: vi.fn((table: unknown, condition?: unknown) => consume({ operation: "count", table: tableName(table), clauses: { where: [condition] } })),
  transaction: vi.fn(async (callback: (database: unknown) => Promise<unknown>) => callback(dbMock)),
  enqueue(...scripted: unknown[]): void {
    results.push(...scripted.map((result) => ({ result })));
  },
  enqueueFor(operation: string, table: string | undefined, ...scripted: unknown[]): void {
    results.push(...scripted.map((result) => ({ operation, table, result })));
  },
  pendingResults(): number {
    return results.length;
  },
};

const redisValues = new Map<string, string>();
export const redisMock = {
  isReady: true,
  get: vi.fn(async (key: string) => redisValues.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, options?: { NX?: boolean; EX?: number }) => {
    if (options?.NX && redisValues.has(key)) return null;
    redisValues.set(key, value);
    return "OK";
  }),
  setEx: vi.fn(async (key: string, _seconds: number, value: string) => {
    redisValues.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (key: string) => Number(redisValues.delete(key))),
  exists: vi.fn(async (key: string) => Number(redisValues.has(key))),
  expire: vi.fn(async () => 1),
  incr: vi.fn(async () => 1),
  decr: vi.fn(async () => 0),
  ttl: vi.fn(async () => -1),
  eval: vi.fn(async (script: string, _options?: unknown) => (script.includes("return {count, ttl}") ? [1, 60] : 1)),
  publish: vi.fn(async () => 0),
  sendCommand: vi.fn(async () => null),
  sAdd: vi.fn(async () => 1),
  sMembers: vi.fn(async () => []),
  sRem: vi.fn(async () => 1),
  mGet: vi.fn(async () => []),
  connect: vi.fn(async () => undefined),
  quit: vi.fn(async () => undefined),
  duplicate: vi.fn(),
  multi: vi.fn(),
};
const initialRedisImplementations = Object.entries(redisMock).flatMap(([name, value]) =>
  vi.isMockFunction(value) ? [[name, value.getMockImplementation()] as const] : [],
);

export const authBoundary = {
  getCurrentUser: vi.fn<(request: FastifyRequest) => Promise<Session | null>>(async () => null),
  verifyApiKey: vi.fn(async (_key: string, _permissions?: Record<string, string[]>) => ({ valid: false, key: null as unknown })),
  auth: {
    api: {
      userHasPermission: vi.fn(async (_input: unknown) => ({ success: true })),
      getSession: vi.fn(async () => null),
    },
  },
};

export function userSession(id = "11111111-1111-4111-8111-111111111111", role: "user" | "editor" | "admin" = "user"): Session {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  return {
    user: {
      id,
      role,
      name: "Test User",
      email: "test@example.invalid",
      emailVerified: true,
      image: null,
      username: id,
      displayUsername: id,
      forceTotp: false,
      twoFactorEnabled: false,
      banned: false,
      banReason: null,
      banExpires: null,
      locale: null,
      bio: null,
      createdAt,
      updatedAt: createdAt,
    },
    session: {
      id: "test-session",
      userId: id,
      token: "test-session-token",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt,
      updatedAt: createdAt,
      ipAddress: null,
      userAgent: null,
      impersonatedBy: null,
    },
  } as unknown as Session;
}

export function resetBoundaries(): void {
  results.length = 0;
  calls.length = 0;
  redisValues.clear();
  redisMock.isReady = true;
  vi.clearAllMocks();
  for (const [name, implementation] of initialRedisImplementations) {
    const mock = Reflect.get(redisMock, name) as ReturnType<typeof vi.fn>;
    mock.mockReset();
    if (implementation) mock.mockImplementation(implementation);
  }
  for (const [table, methods] of Object.entries(queryTables))
    for (const [method, mock] of Object.entries(methods))
      mock.mockReset().mockImplementation(() => Promise.reject(new Error(`Unscripted database query: ${table}.${method}`)));
  authBoundary.getCurrentUser.mockReset().mockResolvedValue(null);
  authBoundary.verifyApiKey.mockReset().mockResolvedValue({ valid: false, key: null });
  authBoundary.auth.api.userHasPermission.mockReset().mockResolvedValue({ success: true });
  authBoundary.auth.api.getSession.mockReset().mockResolvedValue(null);
  redisMock.multi.mockReset().mockImplementation(() => {
    const batch = new Proxy({}, { get: (_target, name) => (name === "exec" ? async () => [] : () => batch) });
    return batch;
  });
  redisMock.duplicate.mockReset().mockReturnValue(redisMock);
}
