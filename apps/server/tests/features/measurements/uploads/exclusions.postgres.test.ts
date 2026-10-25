import { uploads } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { expect, it, vi } from "vitest";

import { excludeUploads } from "../../../../src/features/measurements/uploads/exclusions.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { insertDevice, insertFold, insertPerson, insertUpload } from "../../../helpers/measurementFixtures.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

function requestBy(userId: string): FastifyRequest {
  return { userSession: { user: { id: userId } }, apiToken: null, headers: {}, ip: "127.0.0.1" } as unknown as FastifyRequest;
}

describeOnCrowdDatabase("excluding a person's uploads", () => {
  it("excludes only the uploads that are not withdrawn or excluded yet, so an excluded upload keeps its first reason", () =>
    rolledBack(async (tx) => {
      const administrator = await insertPerson(tx);
      const spammer = await insertPerson(tx);
      const { deviceId } = await insertDevice(tx, { userId: spammer });
      const received = await insertUpload(tx, deviceId);
      const processed = await insertUpload(tx, deviceId, { status: "processed" });
      await insertFold(tx, processed);
      const withdrawn = await insertUpload(tx, deviceId, { status: "withdrawn" });
      const excluded = await insertUpload(tx, deviceId, { status: "excluded", statusReason: "Readings from an emulator" });

      expect(await excludeUploads(requestBy(administrator), { userId: spammer, reason: "Fake readings" })).toBe(2);

      const stored = await tx
        .select({ id: uploads.id, status: uploads.status, reason: uploads.statusReason })
        .from(uploads)
        .where(eq(uploads.deviceId, deviceId));
      expect(new Map(stored.map(({ id, status, reason }) => [id, { status, reason }]))).toEqual(
        new Map([
          [received, { status: "excluded", reason: "Fake readings" }],
          [processed, { status: "excluded", reason: "Fake readings" }],
          [withdrawn, { status: "withdrawn", reason: null }],
          [excluded, { status: "excluded", reason: "Readings from an emulator" }],
        ]),
      );
    }));
});
