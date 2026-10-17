import { statsSnapshots } from "@openbts/drizzle";
import type { SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSnapshotDelta, takeStatsSnapshot } from "../../../src/features/stats/permitsSnapshot.js";
import type { DbTx } from "../../../src/types/global.js";
import { dbMock } from "../../helpers/boundaries.js";

type ConflictClause = { target: unknown[]; targetWhere?: unknown; set: Record<string, SQLWrapper> };

const dialect = new PgDialect();
const KEY = [statsSnapshots.snapshot_date, statsSnapshots.operator_id, statsSnapshots.rat, statsSnapshots.label_mhz, statsSnapshots.label_variant];

function inserts() {
  return dbMock.calls
    .filter((call) => call.operation === "insert" && call.table === "stats_snapshots")
    .map((call) => ({ rows: call.values as Record<string, unknown>[], conflict: call.clauses.onConflictDoUpdate?.[0] as ConflictClause }));
}

function setOf(conflict: ConflictClause): Record<string, string> {
  return Object.fromEntries(Object.entries(conflict.set).map(([column, value]) => [column, dialect.sqlToQuery(value.getSQL()).sql]));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the permit snapshot", () => {
  it("writes one row per operator and label, and one per operator for every band, keyed by the label columns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T14:15:16.789Z"));
    dbMock.enqueueFor(
      "select",
      "official.permits",
      [
        { operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", unique_stations_count: 10, permits_count: 12 },
        { operator_id: 4, rat: "GSM", label_mhz: 900, label_variant: "railway", unique_stations_count: 2, permits_count: 2 },
        { operator_id: 5, rat: "NR", label_mhz: 3500, label_variant: "commercial", unique_stations_count: 7, permits_count: 7 },
      ],
      [
        { operator_id: 4, unique_stations_count: 11 },
        { operator_id: 5, unique_stations_count: 7 },
      ],
    );
    dbMock.enqueueFor("insert", "stats_snapshots", undefined, undefined);

    await takeStatsSnapshot();

    const today = new Date("2026-10-12T00:00:00.000Z");
    const [byLabel, everyBand] = inserts();
    expect(byLabel?.rows).toEqual([
      { snapshot_date: today, operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", unique_stations_count: 10, permits_count: 12 },
      { snapshot_date: today, operator_id: 4, rat: "GSM", label_mhz: 900, label_variant: "railway", unique_stations_count: 2, permits_count: 2 },
      { snapshot_date: today, operator_id: 5, rat: "NR", label_mhz: 3500, label_variant: "commercial", unique_stations_count: 7, permits_count: 7 },
    ]);
    expect(everyBand?.rows).toEqual([
      { snapshot_date: today, operator_id: 4, rat: null, label_mhz: null, label_variant: null, unique_stations_count: 11, permits_count: 0 },
      { snapshot_date: today, operator_id: 5, rat: null, label_mhz: null, label_variant: null, unique_stations_count: 7, permits_count: 0 },
    ]);

    expect(byLabel?.conflict.target).toEqual(KEY);
    expect(everyBand?.conflict.target).toEqual(KEY);
    expect(byLabel?.conflict.targetWhere).toBeUndefined();
    expect(everyBand?.conflict.targetWhere).toBeUndefined();
    expect(setOf(byLabel!.conflict)).toEqual({
      unique_stations_count: "excluded.unique_stations_count",
      permits_count: "excluded.permits_count",
    });
    expect(setOf(everyBand!.conflict)).toEqual({ unique_stations_count: "excluded.unique_stations_count" });
  });

  it("writes nothing when there are no permits", async () => {
    dbMock.enqueueFor("select", "official.permits", [], []);

    await takeStatsSnapshot();

    expect(inserts()).toEqual([]);
  });

  it("reads and writes through the transaction it is given", async () => {
    const tx = { select: vi.fn(dbMock.select), insert: vi.fn(dbMock.insert) };
    dbMock.enqueueFor(
      "select",
      "official.permits",
      [{ operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", unique_stations_count: 1, permits_count: 1 }],
      [{ operator_id: 4, unique_stations_count: 1 }],
    );
    dbMock.enqueueFor("insert", "stats_snapshots", undefined, undefined);

    await takeStatsSnapshot(tx as unknown as DbTx);

    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(dbMock.select).toHaveBeenCalledTimes(2);
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });
});

describe("the change between the two newest snapshots", () => {
  const row = (operator_id: number, rat: string, label_mhz: number, label_variant: string, permits_count: number, operator_name: string | null) => ({
    operator_id,
    rat,
    label_mhz,
    label_variant,
    permits_count,
    operator_name,
  });

  it("is null until two snapshot dates exist", async () => {
    dbMock.enqueueFor("select", "stats_snapshots", [{ snapshot_date: new Date("2026-10-12T00:00:00Z") }]);

    expect(await getSnapshotDelta()).toBeNull();
  });

  it("names each band by its label and keeps the shape of the answer", async () => {
    dbMock.enqueueFor("select", "stats_snapshots", [
      { snapshot_date: new Date("2026-10-12T00:00:00Z") },
      { snapshot_date: new Date("2026-10-11T00:00:00Z") },
    ]);
    dbMock.enqueueFor(
      "select",
      "stats_snapshots",
      [
        row(4, "LTE", 800, "commercial", 120, "Orange"),
        row(4, "GSM", 900, "railway", 5, "Orange"),
        row(5, "LTE", 800, "commercial", 80, null),
        row(5, "NR", 3500, "commercial", 7, null),
      ],
      [row(4, "LTE", 800, "commercial", 100, "Orange"), row(4, "GSM", 900, "railway", 5, "Orange"), row(5, "UMTS", 2100, "commercial", 9, null)],
    );

    expect(await getSnapshotDelta()).toEqual({
      byOperator: [
        { id: 5, name: "Operator 5", permitsDelta: 78 },
        { id: 4, name: "Orange", permitsDelta: 20 },
      ],
      byBand: [
        { id: "LTE:800:commercial", name: "LTE 800", permitsDelta: 100 },
        { id: "UMTS:2100:commercial", name: "UMTS 2100", permitsDelta: -9 },
        { id: "NR:3500:commercial", name: "NR 3500", permitsDelta: 7 },
      ],
    });
  });

  it("names a railway label GSM-R, as the former band table did", async () => {
    dbMock.enqueueFor("select", "stats_snapshots", [
      { snapshot_date: new Date("2026-10-12T00:00:00Z") },
      { snapshot_date: new Date("2026-10-11T00:00:00Z") },
    ]);
    dbMock.enqueueFor("select", "stats_snapshots", [row(9, "GSM", 900, "railway", 6, "PKP PLK")], []);

    expect((await getSnapshotDelta())?.byBand).toEqual([{ id: "GSM:900:railway", name: "GSM-R 900", permitsDelta: 6 }]);
  });
});
