import { DEADLOCK_DETECTED, isDatabaseError } from "../../../../errors.js";

const TRANSACTION_ATTEMPTS = 3;

export async function retryingDeadlocks<Result>(transaction: () => Promise<Result>): Promise<Result> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await transaction();
    } catch (error) {
      if (attempt === TRANSACTION_ATTEMPTS || !isDatabaseError(error, DEADLOCK_DETECTED)) throw error;
    }
  }
}
