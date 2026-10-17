import { describe, expect, it, vi } from "vitest";

import { RunNotOwnedError } from "../../../../../src/features/official/import/runs.js";
import { retryingDeadlocks } from "../../../../../src/features/official/import/steps/deadlocks.js";
import { RUN_ID, databaseFailure, lostDeadlock } from "../../../../helpers/importEngineFixtures.js";

describe("a transaction that may lose a deadlock", () => {
  it("is repeated after a lost deadlock, whether the driver's error arrives bare or wrapped by the query builder", async () => {
    const wrapped = lostDeadlock();
    const transaction = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(wrapped)
      .mockRejectedValueOnce(wrapped.cause)
      .mockResolvedValue("written");

    await expect(retryingDeadlocks(transaction)).resolves.toBe("written");
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("is given up after the third lost deadlock, with that error", async () => {
    const failure = lostDeadlock();
    const transaction = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(retryingDeadlocks(transaction)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["a unique violation", databaseFailure("23505", "duplicate key")],
    ["a serialization failure", databaseFailure("40001", "could not serialize access")],
    ["an error that is not the database's", new Error("connection lost")],
    ["a run that was taken over", new RunNotOwnedError(RUN_ID)],
  ])("is not repeated after %s", async (_name, failure) => {
    const transaction = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(retryingDeadlocks(transaction)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
