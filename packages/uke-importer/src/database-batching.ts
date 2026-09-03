import { chunk } from "./utils.js";

export const DATABASE_STATEMENT_BATCH_SIZE = 500;
export const DATABASE_READ_CONCURRENCY = 4;
export const DATABASE_WRITE_CONCURRENCY = 8;

export async function mapInConcurrentBatches<T, R>(values: T[], concurrency: number, operation: (value: T) => PromiseLike<R>): Promise<R[]> {
  const results: R[] = [];
  for (const group of chunk(values, concurrency)) {
    // oxlint-disable-next-line no-await-in-loop -- each group bounds database concurrency
    results.push(...(await Promise.all(group.map(operation))));
  }
  return results;
}

export async function runInConcurrentBatches<T>(values: T[], concurrency: number, operation: (value: T) => PromiseLike<unknown>): Promise<void> {
  for (const group of chunk(values, concurrency)) {
    // oxlint-disable-next-line no-await-in-loop -- each group bounds database concurrency
    await Promise.all(group.map(operation));
  }
}
