import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sourceAuditOn } from "../../../../src/features/official/import/audit.js";
import { HEARTBEAT_INTERVAL_MS } from "../../../../src/features/official/import/config.js";
import { resolveLicensees } from "../../../../src/features/official/import/licensees.js";
import {
  RunNotOwnedError,
  claimNextRun,
  enqueueRun,
  inRunTransaction,
  requireOwnership,
  startHeartbeat,
} from "../../../../src/features/official/import/runs.js";
import { syncSources } from "../../../../src/features/official/import/sourceSync.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { RUN_ID, claimedRun, statementOf, valuesOf, whereOf } from "../../../helpers/importEngineFixtures.js";

const tx = dbMock as unknown as DbTx;
const run = claimedRun();

const source: OfficialSourceDefinition = {
  key: "test-source",
  countryCode: "PL",
  shortName: "TEST",
  authority: "Test authority",
  homepageUrl: "https://authority.invalid",
  licence: "none stated",
  attribution: "Source: test",
  isRedistributable: true,
  shortLicenseeName: (publishedName) => publishedName.replace(/ S\.A\.$/, ""),
  operatorNameOfLicensee: () => null,
  datasets: [
    { key: "towers", layer: "sites", checkEveryHours: 6, discover: async () => [], parse: async function* none() {} },
    { key: "links", layer: "microwave_links", checkEveryHours: 24, discover: async () => [], parse: async function* none() {} },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("queueing a run", () => {
  it("stores the run with its datasets and approvals", async () => {
    dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }]);
    dbMock.enqueueFor("insert", "official.import_run_datasets", undefined);
    dbMock.enqueueFor("insert", "official.import_run_approvals", undefined);

    const runId = await enqueueRun(tx, {
      sourceId: 1,
      kind: "import",
      trigger: "manual",
      isDryRun: true,
      datasetIds: [1, 3],
      requestedById: "0199d000-0000-7000-8000-0000000000ff",
      approvals: [{ datasetId: 1, slice: "north", snapshotId: 41 }],
    });

    expect(runId).toBe(RUN_ID);
    expect(valuesOf("insert", "official.import_runs")).toEqual([
      { sourceId: 1, kind: "import", trigger: "manual", isDryRun: true, state: "queued", requestedById: "0199d000-0000-7000-8000-0000000000ff" },
    ]);
    expect(valuesOf("insert", "official.import_run_datasets")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1 },
        { runId: RUN_ID, datasetId: 3 },
      ],
    ]);
    expect(valuesOf("insert", "official.import_run_approvals")).toEqual([[{ runId: RUN_ID, datasetId: 1, slice: "north", snapshotId: 41 }]]);
  });

  it("stores a relink run without datasets", async () => {
    dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }]);

    await enqueueRun(tx, { sourceId: 1, kind: "relink", trigger: "cli", isDryRun: false, datasetIds: [], requestedById: null, approvals: [] });

    expect(dbMock.calls.map((call) => call.table)).toEqual(["official.import_runs"]);
  });

  it("stores what a remap run changes with the run", async () => {
    const remap = { licenseeId: 8, fromOperatorId: 4, toOperatorId: null };
    dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }]);
    dbMock.enqueueFor("insert", "official.remap_runs", undefined);

    const queued = { sourceId: 1, trigger: "manual", isDryRun: true, datasetIds: [], requestedById: null, approvals: [] } as const;

    await enqueueRun(tx, { ...queued, kind: "remap", remap });

    expect(valuesOf("insert", "official.remap_runs")).toEqual([{ runId: RUN_ID, ...remap }]);
  });

  it("refuses a remap run without its licensee, and a licensee on any other run", async () => {
    const queued = { sourceId: 1, trigger: "manual", isDryRun: false, datasetIds: [], requestedById: null, approvals: [] } as const;
    const remap = { licenseeId: 8, fromOperatorId: 4, toOperatorId: 5 };

    await expect(enqueueRun(tx, { ...queued, kind: "remap" })).rejects.toThrow("A remap run, and no other");
    await expect(enqueueRun(tx, { ...queued, kind: "import", remap })).rejects.toThrow("A remap run, and no other");
    expect(dbMock.calls).toEqual([]);
  });
});

describe("claiming a run", () => {
  const claimed = {
    id: RUN_ID,
    sourceId: 1,
    sourceKey: "test-source",
    kind: "import",
    isDryRun: false,
    attempt: 2,
    startedAt: "2026-10-12T14:15:16.789Z",
  };

  it("returns the claimed run with a new token and the time it first started", async () => {
    dbMock.enqueueFor("execute", undefined, [{ ...claimed, state: "running" }]);

    const first = await claimNextRun();

    expect(first).toMatchObject({ id: RUN_ID, sourceKey: "test-source", attempt: 2, startedAt: new Date("2026-10-12T14:15:16.789Z") });
    expect(first?.claimToken).toMatch(/^[0-9a-f-]{36}$/);
    const statement = statementOf(dbMock.calls[0]);
    expect(statement.params).toEqual([10, 5, 5, "Abandoned after 5 attempts", 5, first?.claimToken, 5, 5]);
    expect(statement.sql).toContain("FOR UPDATE OF run SKIP LOCKED");
  });

  it("passes over a run that used its five attempts and claims the next", async () => {
    dbMock.enqueueFor("execute", undefined, [{ ...claimed, id: "0199d000-0000-7000-8000-000000000009", attempt: 5, state: "failed" }]);
    dbMock.enqueueFor("execute", undefined, [{ ...claimed, state: "running" }]);

    expect((await claimNextRun())?.id).toBe(RUN_ID);
    expect(dbMock.calls).toHaveLength(2);
  });

  it("returns nothing when no run waits", async () => {
    dbMock.enqueueFor("execute", undefined, []);

    expect(await claimNextRun()).toBeNull();
  });
});

describe("the ownership of a run", () => {
  it("holds while the row carries the runner's token and is running", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [{ claimToken: run.claimToken, state: "running" }]);

    await expect(requireOwnership(tx, run)).resolves.toBeUndefined();
    expect(dbMock.calls[0]?.clauses.for).toEqual(["update"]);
  });

  it.each([
    ["another token", [{ claimToken: "0199d000-0000-7000-8000-00000000bbbb", state: "running" }]],
    ["a cancelled run", [{ claimToken: run.claimToken, state: "cancelled" }]],
    ["a finished run", [{ claimToken: run.claimToken, state: "done" }]],
    ["no token", [{ claimToken: null, state: "queued" }]],
    ["a deleted run", []],
  ])("is lost with %s", async (_case, rows) => {
    dbMock.enqueueFor("select", "official.import_runs", rows);

    await expect(requireOwnership(tx, run)).rejects.toBeInstanceOf(RunNotOwnedError);
  });

  it("is checked before the work of every transaction", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [{ claimToken: "0199d000-0000-7000-8000-00000000bbbb", state: "running" }]);
    const work = vi.fn(async () => "written");

    await expect(inRunTransaction({ run, database: tx }, work)).rejects.toBeInstanceOf(RunNotOwnedError);
    expect(work).not.toHaveBeenCalled();
  });
});

describe("the heartbeat", () => {
  it("refreshes the run every 30 seconds through the ownership check", async () => {
    vi.useFakeTimers();
    dbMock.enqueueFor("select", "official.import_runs", [{ claimToken: run.claimToken, state: "running" }]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);
    const onLost = vi.fn();

    const stop = startHeartbeat(run, onLost);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    stop();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);

    expect(dbMock.calls.map((call) => [call.operation, call.table])).toEqual([
      ["select", "official.import_runs"],
      ["update", "official.import_runs"],
    ]);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("tells the runner when the run was taken over or cancelled", async () => {
    vi.useFakeTimers();
    dbMock.enqueueFor("select", "official.import_runs", [{ claimToken: run.claimToken, state: "cancelled" }]);
    const onLost = vi.fn();

    const stop = startHeartbeat(run, onLost);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    stop();

    expect(onLost).toHaveBeenCalledWith(expect.any(RunNotOwnedError));
    expect(dbMock.calls).toHaveLength(1);
  });
});

describe("the source sync", () => {
  const storedSource = {
    id: 1,
    key: "test-source",
    countryCode: "PL",
    shortName: "TEST",
    authority: "Test authority",
    homepageUrl: "https://authority.invalid",
    licence: "none stated",
    attribution: "Source: test",
    coverageNote: "kept",
    isRedistributable: true,
    isEnabled: true,
    isVisible: true,
  };

  it("adds a new source and its datasets switched off and hidden", async () => {
    dbMock.enqueueFor("select", "official.sources", []);
    dbMock.enqueueFor("insert", "official.sources", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.datasets", []);
    dbMock.enqueueFor("insert", "official.datasets", undefined);
    dbMock.enqueueFor("select", "official.licensees", []);

    const result = await syncSources([source]);

    expect(result).toEqual({ addedSources: ["test-source"], addedDatasets: ["test-source/towers", "test-source/links"], licenseeNamesCorrected: 0 });
    expect(valuesOf("insert", "official.sources")).toEqual([
      {
        key: "test-source",
        countryCode: "PL",
        shortName: "TEST",
        authority: "Test authority",
        homepageUrl: "https://authority.invalid",
        licence: "none stated",
        attribution: "Source: test",
        isRedistributable: true,
        isEnabled: false,
        isVisible: false,
      },
    ]);
    expect(valuesOf("insert", "official.datasets")).toEqual([
      [
        { sourceId: 1, key: "towers", layer: "sites", checkEveryHours: 6, isEnabled: false },
        { sourceId: 1, key: "links", layer: "microwave_links", checkEveryHours: 24, isEnabled: false },
      ],
    ]);
  });

  it("writes nothing for a source that is stored as the code describes it", async () => {
    dbMock.enqueueFor("select", "official.sources", [storedSource]);
    dbMock.enqueueFor("select", "official.datasets", [{ key: "towers" }, { key: "links" }]);
    dbMock.enqueueFor("select", "official.licensees", [{ id: 8, name: "Orange Polska", legalName: "Orange Polska S.A." }]);

    expect(await syncSources([source])).toEqual({ addedSources: [], addedDatasets: [], licenseeNamesCorrected: 0 });
    expect(dbMock.calls.map((call) => call.operation)).toEqual(["select", "select", "select"]);
  });

  it("updates the descriptive fields only, adds a missing dataset and corrects licensee short names", async () => {
    dbMock.enqueueFor("select", "official.sources", [{ ...storedSource, attribution: "Old text", isEnabled: false }]);
    dbMock.enqueueFor("update", "official.sources", undefined);
    dbMock.enqueueFor("select", "official.datasets", [{ key: "towers" }, { key: "retired" }]);
    dbMock.enqueueFor("insert", "official.datasets", undefined);
    dbMock.enqueueFor("select", "official.licensees", [
      { id: 7, name: "TFILM", legalName: "SATFILM S.A." },
      { id: 8, name: "Orange Polska", legalName: "Orange Polska S.A." },
    ]);
    dbMock.enqueueFor("update", "official.licensees", undefined);

    const result = await syncSources([source]);

    expect(result).toEqual({ addedSources: [], addedDatasets: ["test-source/links"], licenseeNamesCorrected: 1 });
    const [described] = valuesOf("update", "official.sources") as Record<string, unknown>[];
    expect(Object.keys(described ?? {}).sort()).toEqual([
      "attribution",
      "authority",
      "countryCode",
      "homepageUrl",
      "isRedistributable",
      "licence",
      "shortName",
      "updatedAt",
    ]);
    expect(valuesOf("update", "official.licensees")).toEqual([{ name: "SATFILM" }]);
  });
});

describe("the licensee of a published name", () => {
  const orange = { id: 8, name: "Orange Polska", operatorId: 4 };
  const linksLayer = { addsUnmapped: true };
  const sitesLayer = { addsUnmapped: false };
  const suggesting: OfficialSourceDefinition = { ...source, operatorNameOfLicensee: (publishedName) => publishedName.replace(/ S\.A\.$/, "") };

  function operatorQueryParams(): unknown[] {
    return whereOf(dbMock.calls.find((call) => call.operation === "select" && call.table === "operators")).params;
  }

  it("is the source's licensee with that legal name, without a look at short names", async () => {
    dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);

    const resolved = await resolveLicensees(tx, 1, source, ["Orange Polska S.A."], linksLayer);

    expect(resolved).toEqual(new Map([["Orange Polska S.A.", { licenseeId: 8, operatorId: 4 }]]));
    expect(dbMock.calls.map((call) => call.operation)).toEqual(["select"]);
  });

  it("is otherwise the source's one licensee with its short name: a second spelling adds no row", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], [orange]);

    const resolved = await resolveLicensees(tx, 1, source, ["Orange Polska"], linksLayer);

    expect(resolved).toEqual(new Map([["Orange Polska", { licenseeId: 8, operatorId: 4 }]]));
    expect(dbMock.calls.map((call) => call.operation)).toEqual(["select", "select"]);
  });

  it("is a new row when two of the source's licensees share its short name", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], [orange, { id: 9, name: "Orange Polska", operatorId: null }]);
    dbMock.enqueueFor("insert", "official.licensees", [{ id: 10, legalName: "Orange Polska", operatorId: null }]);

    const resolved = await resolveLicensees(tx, 1, source, ["Orange Polska"], linksLayer);

    expect(resolved).toEqual(new Map([["Orange Polska", { licenseeId: 10, operatorId: null }]]));
    expect(valuesOf("insert", "official.licensees")).toEqual([
      [{ sourceId: 1, full_name: "Orange Polska", name: "Orange Polska", operatorId: null }],
    ]);
  });

  it("is, for a microwave link, a new row even when its suggestion names no operator of the source's country", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], []);
    dbMock.enqueueFor("select", "operators", [{ id: 5, name: "Play" }]);
    dbMock.enqueueFor("insert", "official.licensees", [
      { id: 12, legalName: "Play S.A.", operatorId: 5 },
      { id: 13, legalName: "SATFILM S.A.", operatorId: null },
    ]);

    const resolved = await resolveLicensees(tx, 1, suggesting, ["Play S.A.", "SATFILM S.A."], linksLayer);

    expect(resolved).toEqual(
      new Map([
        ["Play S.A.", { licenseeId: 12, operatorId: 5 }],
        ["SATFILM S.A.", { licenseeId: 13, operatorId: null }],
      ]),
    );
    expect(valuesOf("insert", "official.licensees")).toEqual([
      [
        { sourceId: 1, full_name: "Play S.A.", name: "Play", operatorId: 5 },
        { sourceId: 1, full_name: "SATFILM S.A.", name: "SATFILM", operatorId: null },
      ],
    ]);
    expect(operatorQueryParams()).toEqual(["PL", "Play", "SATFILM"]);
  });

  it("is, for a site, a new row only when its suggestion names one of the source country's operators", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], []);
    dbMock.enqueueFor("select", "operators", [{ id: 5, name: "Play" }]);
    dbMock.enqueueFor("insert", "official.licensees", [{ id: 12, legalName: "Play S.A.", operatorId: 5 }]);

    const resolved = await resolveLicensees(tx, 1, suggesting, ["Play S.A.", "SATFILM S.A."], sitesLayer);

    expect(resolved).toEqual(new Map([["Play S.A.", { licenseeId: 12, operatorId: 5 }]]));
    expect(valuesOf("insert", "official.licensees")).toEqual([[{ sourceId: 1, full_name: "Play S.A.", name: "Play", operatorId: 5 }]]);
    expect(operatorQueryParams()).toEqual(["PL", "Play", "SATFILM"]);
  });

  it("is, for a site whose suggestion names no operator, nothing at all: no row is stored for any of its spellings", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], []);
    dbMock.enqueueFor("select", "operators", []);

    const resolved = await resolveLicensees(tx, 1, suggesting, ["SATFILM S.A.", "SATFILM"], sitesLayer);

    expect(resolved).toEqual(new Map());
    expect(dbMock.calls.map((call) => [call.operation, call.table])).toEqual([
      ["select", "official.licensees"],
      ["select", "official.licensees"],
      ["select", "operators"],
    ]);
  });

  it("is, for a site, the stored licensee without an operator as it is, so its records are skipped and nothing is added", async () => {
    dbMock.enqueueFor(
      "select",
      "official.licensees",
      [{ id: 9, legalName: "SATFILM S.A.", operatorId: null }],
      [{ id: 9, name: "SATFILM", operatorId: null }],
    );

    const resolved = await resolveLicensees(tx, 1, suggesting, ["SATFILM S.A.", "SATFILM"], sitesLayer);

    expect(resolved).toEqual(
      new Map([
        ["SATFILM S.A.", { licenseeId: 9, operatorId: null }],
        ["SATFILM", { licenseeId: 9, operatorId: null }],
      ]),
    );
    expect(dbMock.calls.map((call) => call.operation)).toEqual(["select", "select"]);
  });

  it("is one new row for two unseen spellings of one short name", async () => {
    dbMock.enqueueFor("select", "official.licensees", [], []);
    dbMock.enqueueFor("insert", "official.licensees", [{ id: 11, legalName: "SATFILM S.A.", operatorId: null }]);

    const resolved = await resolveLicensees(tx, 1, source, ["SATFILM S.A.", "SATFILM"], linksLayer);

    expect(resolved).toEqual(
      new Map([
        ["SATFILM S.A.", { licenseeId: 11, operatorId: null }],
        ["SATFILM", { licenseeId: 11, operatorId: null }],
      ]),
    );
    expect(valuesOf("insert", "official.licensees")).toEqual([[{ sourceId: 1, full_name: "SATFILM S.A.", name: "SATFILM", operatorId: null }]]);
  });
});

describe("the audit callback handed to a source's hook", () => {
  it("records one operation of the given kind from the import, and one entry per change, on the release's transaction", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 77 }]);
    dbMock.enqueueFor("insert", "audit_logs", undefined);
    const recorded = vi.fn();

    await sourceAuditOn(tx, recorded)({ kind: "official.import", metadata: { dataset: "device_registry", operator_id: 4 } }, [
      { entity: "extra_identificators", op: "create", recordId: 900, stationId: 100, new: { id: 900, mno_name: "WAW" } },
      { entity: "extra_identificators", op: "update", recordId: 901, stationId: 101, old: { mno_name: "OLD" }, new: { mno_name: "NEW" } },
    ]);

    expect(valuesOf("insert", "audit_operations")).toEqual([
      { kind: "official.import", source: "import", metadata: { dataset: "device_registry", operator_id: 4 } },
    ]);
    expect(valuesOf("insert", "audit_logs")).toEqual([
      [
        {
          operation_id: 77,
          entity: "extra_identificators",
          op: "create",
          record_id: "900",
          station_id: 100,
          old_values: null,
          new_values: { id: 900, mno_name: "WAW" },
        },
        {
          operation_id: 77,
          entity: "extra_identificators",
          op: "update",
          record_id: "901",
          station_id: 101,
          old_values: { mno_name: "OLD" },
          new_values: { mno_name: "NEW" },
        },
      ],
    ]);
    expect(recorded).toHaveBeenCalledWith(2);
  });

  it("records nothing when the hook changed nothing", async () => {
    const recorded = vi.fn();

    await sourceAuditOn(tx, recorded)({ kind: "official.import", metadata: {} }, []);

    expect(dbMock.calls).toEqual([]);
    expect(recorded).not.toHaveBeenCalled();
  });
});
