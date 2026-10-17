import { chunks } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import type { AfterStepContext } from "../types.js";
import { retryingDeadlocks } from "./deadlocks.js";

const SUMMARIES_PER_TRANSACTION = 200;

export async function notifyInPages<Summary extends { lastSeq: number }>(
  context: AfterStepContext,
  summaries: readonly Summary[],
  notifyPage: (tx: DbTx, page: readonly Summary[]) => Promise<void>,
): Promise<void> {
  const { lastSeq } = context;
  const pending = summaries.filter((summary) => lastSeq === null || summary.lastSeq > lastSeq);

  for (const page of chunks(pending, SUMMARIES_PER_TRANSACTION)) {
    // eslint-disable-next-line no-await-in-loop
    await retryingDeadlocks(() =>
      context.transaction(async (tx) => {
        await notifyPage(tx, page);
        await context.saveProgress(tx, Math.max(...page.map((summary) => summary.lastSeq)));
      }),
    );
  }
}
