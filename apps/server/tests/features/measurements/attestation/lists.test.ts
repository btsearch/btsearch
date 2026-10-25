import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import { refreshBootKeyList } from "../../../../src/features/measurements/attestation/bootKeyList.js";
import { refreshAttestationRevocations } from "../../../../src/features/measurements/attestation/revocationList.js";
import { BOOT_KEY_LISTS } from "../../../../src/features/measurements/attestation/trustedKeys.js";
import { serialBytes } from "../../../../src/features/measurements/attestation/verify.js";
import { dbMock } from "../../../helpers/boundaries.js";

const grapheneOsList = readFileSync(new URL("../../../fixtures/attestation/grapheneos-attestation.json", import.meta.url));
const grapheneOsSignature = readFileSync(new URL("../../../fixtures/attestation/grapheneos-attestation.json.sig", import.meta.url));
const grapheneOsTimestamp = JSON.parse(grapheneOsList.toString("utf8")).timestamp as number;
const grapheneOs = BOOT_KEY_LISTS.find((list) => list.os === "grapheneos")!;

function serve(bodies: Record<string, Buffer | string>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url in bodies ? new Response(bodies[url]) : new Response("missing", { status: 404 }))),
  );
}

describe("refreshBootKeyList", () => {
  it("adds the keys of a list signed with GrapheneOS's pinned key", async () => {
    serve({ "https://grapheneos.org/attestation.json": grapheneOsList, "https://grapheneos.org/attestation.json.sig": grapheneOsSignature });
    dbMock.enqueueFor("select", "boot_key_lists", [{ listTimestamp: grapheneOsTimestamp - 1 }]);
    dbMock.enqueueFor("insert", "known_boot_keys", []);
    dbMock.enqueueFor("insert", "boot_key_lists", []);
    await refreshBootKeyList(grapheneOs);

    const keys = dbMock.calls.find((call) => call.operation === "insert" && call.table === "known_boot_keys")?.values as { os: string }[];
    expect(keys).toHaveLength(21);
    expect(keys.every((key) => key.os === "grapheneos")).toBe(true);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "boot_key_lists")?.values).toMatchObject({
      listTimestamp: grapheneOsTimestamp,
    });
  });

  it("refuses a list whose signature does not cover it", async () => {
    const altered = Buffer.from(grapheneOsList.toString("utf8").replace(/"timestamp":\d+/, `"timestamp":${grapheneOsTimestamp + 1}`));
    serve({ "https://grapheneos.org/attestation.json": altered, "https://grapheneos.org/attestation.json.sig": grapheneOsSignature });
    await expect(refreshBootKeyList(grapheneOs)).rejects.toThrow("not signed with its pinned key");
  });

  it("refuses a list older than the last one seen", async () => {
    serve({ "https://grapheneos.org/attestation.json": grapheneOsList, "https://grapheneos.org/attestation.json.sig": grapheneOsSignature });
    dbMock.enqueueFor("select", "boot_key_lists", [{ listTimestamp: grapheneOsTimestamp + 1 }]);
    await expect(refreshBootKeyList(grapheneOs)).rejects.toThrow("went back");
  });
});

describe("refreshAttestationRevocations", () => {
  const statusUrl = "https://android.googleapis.com/attestation/status";

  function revocationCalls(operation: string) {
    return dbMock.calls.filter((call) => call.operation === operation && call.table === "attestation_revocations");
  }

  it("stores each listed serial with its status and reason", async () => {
    serve({
      [statusUrl]: JSON.stringify({
        entries: {
          "388266760658996860d": { status: "REVOKED", reason: "KEY_COMPROMISE" },
          c35747a084470c3: { status: "SUSPENDED", expires: "2027-01-01" },
        },
      }),
    });
    dbMock.enqueueFor("select", "attestation_revocations", []);
    dbMock.enqueueFor("insert", "attestation_revocations", []);
    await refreshAttestationRevocations();

    expect(revocationCalls("insert")[0]?.values).toEqual([
      { serial: serialBytes("388266760658996860d"), status: "revoked", reason: "KEY_COMPROMISE" },
      { serial: serialBytes("c35747a084470c3"), status: "suspended", reason: null },
    ]);
  });

  it("writes a list too long for one statement in several, so Postgres's parameter limit is never reached", async () => {
    const serials = Array.from({ length: 12_000 }, (_, index) => (index + 1).toString(16).padStart(4, "0"));
    serve({ [statusUrl]: JSON.stringify({ entries: Object.fromEntries(serials.map((serial) => [serial, { status: "REVOKED" }])) }) });
    dbMock.enqueueFor("select", "attestation_revocations", []);
    dbMock.enqueueFor("insert", "attestation_revocations", [], [], []);
    await refreshAttestationRevocations();

    expect(revocationCalls("insert").map((call) => (call.values as unknown[]).length)).toEqual([5_000, 5_000, 2_000]);
  });

  it.each([
    { name: "an empty list", body: JSON.stringify({ entries: {} }), error: "came back empty" },
    { name: "a list in another shape", body: JSON.stringify({ revoked: ["388266760658996860d"] }), error: z.ZodError },
  ])("keeps the stored list when Google answers $name", async ({ body, error }) => {
    serve({ [statusUrl]: body });
    await expect(refreshAttestationRevocations()).rejects.toThrow(error);
  });
});
