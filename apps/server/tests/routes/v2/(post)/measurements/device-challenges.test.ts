import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/measurements/device-challenges.js";
import { redisMock, userSession } from "../../../../helpers/boundaries.js";
import { appClientId, appToken, setMeasurementUploads } from "../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const request = { method: "POST" as const, url: "/measurements/device-challenges" };

afterEach(() => setMeasurementUploads(false));

describe("POST /measurements/device-challenges", () => {
  it("keeps a challenge for 10 minutes, for this account and app only", async () => {
    setMeasurementUploads(true);
    const response = await injectMutation(route, request, { session: userSession(), oauthToken: appToken() });

    expect(response.statusCode).toBe(200);
    const challenge = Buffer.from(response.json().data.challenge, "base64url");
    expect(Date.parse(response.json().data.expiresAt) - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(redisMock.setEx).toHaveBeenCalledWith(
      `measurements:device-challenge:${createHash("sha256").update(challenge).digest("hex")}`,
      600,
      `${userSession().user.id} ${appClientId}`,
    );
  });

  it("is closed while uploads are switched off", async () => {
    expectError(await injectMutation(route, request, { session: userSession(), oauthToken: appToken() }), 403, "FEATURE_DISABLED");
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });
});
