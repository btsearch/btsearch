import { describe, expect, it, vi } from "vitest";

import deleteAccountPublishableKey from "../../../../src/routes/v1/(delete)/account/publishable-keys/[id].js";
import { authBoundary, dbMock, userSession } from "../../../helpers/boundaries.js";
import { auditCalls, injectMutation } from "../../../helpers/mutationAssertions.js";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const keyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const cookie = "better-auth.session_token=session-token.signature";

describe("DELETE /account/publishable-keys/:id", () => {
  it("deletes the key through better-auth as the signed-in user and leaves the audit entry to the auth hook", async () => {
    const deleteApiKey = vi.fn(async (_input: { body: { keyId: string }; headers: Headers }) => ({ success: true }));
    Object.assign(authBoundary.auth.api, { deleteApiKey });
    dbMock.query.apikeys.findFirst.mockResolvedValue({ id: keyId, metadata: JSON.stringify({ type: "publishable" }) });

    const response = await injectMutation(
      deleteAccountPublishableKey,
      { method: "DELETE", url: `/account/publishable-keys/${keyId}`, headers: { cookie } },
      { session: userSession(userId) },
    );

    expect(response.statusCode).toBe(204);
    expect(deleteApiKey).toHaveBeenCalledOnce();
    expect(deleteApiKey.mock.calls[0]?.[0].body).toEqual({ keyId });
    expect(deleteApiKey.mock.calls[0]?.[0].headers.get("cookie")).toBe(cookie);
    expect(auditCalls().operations).toEqual([]);
  });
});
