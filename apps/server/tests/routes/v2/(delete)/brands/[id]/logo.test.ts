import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../src/routes/v2/(delete)/brands/[id]/logo.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const files = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files, ...files }));

const previous = { id: 1, slug: "example", name: "Example", color: "#112233", logoFile: "old.svg", logoWidth: 100, logoHeight: 30 };

function auditOperation() {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
}

describe("DELETE /brands/:id/logo", () => {
  beforeEach(() => {
    files.unlink.mockReset().mockResolvedValue(undefined);
  });

  it("clears all logo fields in an audited transaction before deleting the old file", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: previous.logoFile });
    auditOperation();
    dbMock.enqueueFor("select", "brands", [previous]);
    dbMock.enqueueFor("update", "brands", [{ ...previous, logoFile: null, logoWidth: null, logoHeight: null }]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "DELETE", url: "/brands/1/logo" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "brands")?.values).toEqual({
      logoFile: null,
      logoWidth: null,
      logoHeight: null,
      updatedAt: expect.any(Date),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({
        entity: "brands",
        op: "update",
        record_id: "1",
        old_values: previous,
        new_values: expect.objectContaining({ logoFile: null }),
      }),
    ]);
    expect(files.unlink).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/[\\/]old\.svg$/));
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns 204 without opening a transaction when the brand already has no logo", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: null });
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: "/brands/1/logo" })).statusCode).toBe(204);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown brand", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(undefined);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url: "/brands/1/logo" });

    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("does not delete a file when the brand disappears before the row lock", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: "old.svg" });
    auditOperation();
    dbMock.enqueueFor("select", "brands", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: "/brands/1/logo" })).statusCode).toBe(404);
    expect(files.unlink).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns 204 when another request removed the logo before the row lock", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: "old.svg" });
    auditOperation();
    dbMock.enqueueFor("select", "brands", [{ ...previous, logoFile: null }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: "/brands/1/logo" })).statusCode).toBe(204);
    expect(files.unlink).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([[], new Error("database unavailable")])("keeps the file when the database cannot clear the logo (%j)", async (result) => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: "old.svg" });
    auditOperation();
    dbMock.enqueueFor("select", "brands", [previous]);
    dbMock.enqueueFor("update", "brands", result);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url: "/brands/1/logo" });

    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_DELETE");
    expect(files.unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("keeps the successful response if removing the already-unlinked old file fails", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ logoFile: "old.svg" });
    auditOperation();
    dbMock.enqueueFor("select", "brands", [previous]);
    dbMock.enqueueFor("update", "brands", [{ ...previous, logoFile: null, logoWidth: null, logoHeight: null }]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    files.unlink.mockRejectedValue(new Error("ENOENT"));
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: "/brands/1/logo" })).statusCode).toBe(204);
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992"])("rejects invalid brand id %s before database access", async (id) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: `/brands/${id}/logo` })).statusCode).toBe(400);
    expect(dbMock.query.brands.findFirst).not.toHaveBeenCalled();
    expect(files.unlink).not.toHaveBeenCalled();
  });
});
