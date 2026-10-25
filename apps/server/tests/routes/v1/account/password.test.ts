import { describe, expect, it } from "vitest";

import { passkeyVerifiedKey } from "../../../../src/plugins/auth/hooks.js";
import deleteAccountPassword from "../../../../src/routes/v1/(delete)/account/password.js";
import postAccountPassword from "../../../../src/routes/v1/(post)/account/password.js";
import { dbMock, redisMock, userSession } from "../../../helpers/boundaries.js";
import { auditCalls, injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const options = { session: userSession(userId) };

describe("POST /account/password", () => {
  it("adds the password inside the audited operation and records it without the password or its hash", async () => {
    await redisMock.set(passkeyVerifiedKey(userId), "1");
    dbMock.query.accounts.findFirst.mockResolvedValue(undefined);
    scriptAudit();
    dbMock.enqueueFor("insert", "accounts", []);

    const response = await injectMutation(
      postAccountPassword,
      { method: "POST", url: "/account/password", payload: { newPassword: "a-new-password" } },
      options,
    );

    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.find((call) => call.table === "accounts")?.values).toMatchObject({ userId, providerId: "credential" });
    const audit = auditCalls();
    expect(audit.operations).toEqual([expect.objectContaining({ kind: "user.password", actor_id: userId, performed_by: userId })]);
    expect(audit.entries).toEqual([
      expect.objectContaining({
        entity: "users",
        op: "update",
        record_id: userId,
        new_values: { password: "[changed]" },
        metadata: { username: userId, self: true },
      }),
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/a-new-password|argon2/);
  });
});

describe("DELETE /account/password", () => {
  it("removes the password and records that the account has none", async () => {
    dbMock.query.passkeys.findMany.mockResolvedValue([{ id: "passkey-1" }]);
    scriptAudit();
    dbMock.enqueueFor("delete", "accounts", [{ id: "account-1" }]);

    const response = await injectMutation(deleteAccountPassword, { method: "DELETE", url: "/account/password" }, options);

    expect(response.statusCode).toBe(204);
    expect(auditCalls().entries).toEqual([expect.objectContaining({ entity: "users", record_id: userId, new_values: { password: null } })]);
  });

  it("records nothing when the account had no password to remove", async () => {
    dbMock.query.passkeys.findMany.mockResolvedValue([{ id: "passkey-1" }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "accounts", []);
    dbMock.enqueueFor("delete", "audit_operations", []);

    const response = await injectMutation(deleteAccountPassword, { method: "DELETE", url: "/account/password" }, options);

    expect(response.statusCode).toBe(204);
    expect(auditCalls().entries).toEqual([]);
  });
});
