import { type SQLWrapper, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";

import { unlistedPermits } from "../../../../../src/features/official/import/steps/unlistedPermits.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { ownRun, recordTransactions, runStep, scriptStepFinish, scriptStepStart, whereOf } from "../../../../helpers/importEngineFixtures.js";

const dialect = new PgDialect();

function unlisted(firstPermitId: number, count: number): { permitId: number; officialSiteId: number }[] {
  return Array.from({ length: count }, (_, index) => ({ permitId: firstPermitId + index, officialSiteId: 500 }));
}

function unlistedReads() {
  return dbMock.calls.filter((call) => call.operation === "select" && call.table === "official.permits");
}

function scriptArchivedPage(permits: readonly { permitId: number; officialSiteId: number }[]): void {
  ownRun(1);
  dbMock.enqueueFor("select", "official.permits", [...permits]);
  dbMock.enqueueFor("select", "stations_permits", []);
  dbMock.enqueueFor("insert", "official.import_changes", undefined);
  dbMock.enqueueFor("delete", "official.permits", undefined);
}

beforeEach(recordTransactions);

describe("the unlisted permits step", () => {
  it("archives a thousand permits per transaction, and reads each next page after the last permit it archived", async () => {
    scriptStepStart();
    scriptArchivedPage(unlisted(1, 1000));
    scriptArchivedPage(unlisted(2001, 3));
    scriptStepFinish();

    await runStep(unlistedPermits);

    expect(dbMock.pendingResults()).toBe(0);
    const reads = unlistedReads();
    expect(reads.map((read) => [...whereOf(read).params, ...(read.clauses.limit ?? [])])).toEqual([
      [1, 0, 1000],
      [1, 1000, 1000],
    ]);
    expect(whereOf(reads[0]).sql).toContain('("official"."sites"."source_id" = $1) and ("official"."permits"."id" > $2) and (not exists');
    expect(reads[0]?.clauses.orderBy?.map((order) => dialect.sqlToQuery(sql`${order as SQLWrapper}`).sql)).toEqual(['"official"."permits"."id"']);
  });

  it("stops after one read when nothing is unlisted", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.permits", []);
    scriptStepFinish();

    await runStep(unlistedPermits);

    expect(dbMock.pendingResults()).toBe(0);
    expect(unlistedReads()).toHaveLength(1);
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });
});
