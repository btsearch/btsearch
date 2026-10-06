import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { InjectOptions } from "fastify";
import { expect } from "vitest";

import { dbMock } from "./boundaries.js";
import { createRouteHarness } from "./routeHarness.js";

export async function injectMutation(
  route: Parameters<typeof createRouteHarness>[0],
  request: InjectOptions,
  options: Parameters<typeof createRouteHarness>[1] = {},
) {
  const app = await createRouteHarness(route, options);
  try {
    return await app.inject(request);
  } finally {
    await app.close();
  }
}

export function expectError(response: { statusCode: number; json(): unknown }, statusCode: number, code: string, message?: string) {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toMatchObject({ errors: [message === undefined ? { code } : { code, message }] });
}

export function scriptAudit() {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
}

export function whereQuery(table: string, operation: string) {
  const call = dbMock.calls.find((entry) => entry.table === table && entry.operation === operation);
  const condition = call?.clauses.where?.[0];
  if (condition === undefined) throw new Error(`No where condition for ${operation} ${table}`);
  return new PgDialect().sqlToQuery(condition as SQL);
}
