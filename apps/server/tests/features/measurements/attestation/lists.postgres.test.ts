import { attestationRevocations } from "@openbts/drizzle";
import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";

import { refreshAttestationRevocations } from "../../../../src/features/measurements/attestation/revocationList.js";
import { serialBytes } from "../../../../src/features/measurements/attestation/verify.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

function randomSerial(): string {
  return randomBytes(8).toString("hex");
}

describeOnCrowdDatabase("Google's attestation revocation list", () => {
  it("replaces the stored revocations: listed serials are added or updated, unlisted ones are deleted", () =>
    rolledBack(async (tx) => {
      const [unlisted, suspendedNow, newlyRevoked] = [randomSerial(), randomSerial(), randomSerial()];
      await tx.insert(attestationRevocations).values([
        { serial: serialBytes(unlisted), status: "revoked" },
        { serial: serialBytes(suspendedNow), status: "revoked", reason: "KEY_COMPROMISE" },
      ]);
      const entries = { [suspendedNow]: { status: "SUSPENDED" }, [newlyRevoked]: { status: "REVOKED", reason: "KEY_COMPROMISE" } };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ entries }))),
      );

      await refreshAttestationRevocations();

      const stored = await tx
        .select({ serial: attestationRevocations.serial, status: attestationRevocations.status, reason: attestationRevocations.reason })
        .from(attestationRevocations);
      expect(new Map(stored.map(({ serial, status, reason }) => [serial.toString("hex"), { status, reason }]))).toEqual(
        new Map([
          [serialBytes(suspendedNow).toString("hex"), { status: "suspended", reason: null }],
          [serialBytes(newlyRevoked).toString("hex"), { status: "revoked", reason: "KEY_COMPROMISE" }],
        ]),
      );
    }));
});
