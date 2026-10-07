export type LimitedTask = () => Promise<void>;

const QUERY_CONCURRENCY = 4;

export async function runLimited(tasks: readonly LimitedTask[]): Promise<void> {
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const task = tasks[nextIndex];
    nextIndex += 1;
    if (task === undefined) return;
    await task();
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(QUERY_CONCURRENCY, tasks.length) }, runNext));
}
