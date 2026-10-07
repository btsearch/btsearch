import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/terrain-profiles/[id].js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const id = "20ddf715-e424-4e63-8c73-cc1326c74b3a";
const profileKey = `terrain:profile:v1:${id}`;

describe("DELETE /terrain-profiles/:id", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  });

  it("cancels a pending profile, keeps its cached data, and sets a cancellation marker", async () => {
    const previous = { id, status: "pending", createdAt: "2026-10-06T09:00:00Z", result: null, request: { station: { source: "internal", id: 1 } } };
    await redisMock.setEx(profileKey, 3600, JSON.stringify(previous));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url: `/terrain-profiles/${id}` });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await redisMock.get(`${profileKey}:cancelled`)).toBe("1");
    expect(JSON.parse((await redisMock.get(profileKey)) ?? "null")).toEqual({
      ...previous,
      status: "cancelled",
      updatedAt: "2026-10-06T10:00:00.000Z",
      expiresAt: "2026-10-06T11:00:00.000Z",
    });
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["ready", "failed", "cancelled"])("leaves a %s profile unchanged", async (status) => {
    const previous = JSON.stringify({ id, status, updatedAt: "2026-10-06T09:00:00Z" });
    await redisMock.setEx(profileKey, 3600, previous);
    redisMock.setEx.mockClear();
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: `/terrain-profiles/${id}` })).statusCode).toBe(204);
    expect(redisMock.setEx).not.toHaveBeenCalled();
    expect(await redisMock.get(profileKey)).toBe(previous);
  });

  it("returns 404 for a missing or expired profile without writing a cancellation marker", async () => {
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url: `/terrain-profiles/${id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "0", "null"])("rejects profile id %s before accessing Redis", async (profileId) => {
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url: `/terrain-profiles/${profileId}` });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].code).toBe("VALIDATION_ERROR");
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("does not report successful cancellation when Redis cannot save the marker", async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ id, status: "pending" }));
    redisMock.setEx.mockRejectedValue(new Error("Redis unavailable"));
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: `/terrain-profiles/${id}` })).statusCode).toBe(500);
  });
});
