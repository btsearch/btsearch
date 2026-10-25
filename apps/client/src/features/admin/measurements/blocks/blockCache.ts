import type { MeasurementQuirkRule, MeasurementReadingBlock } from "@openbts/shared/contract";
import type { QueryClient } from "@tanstack/react-query";

import { invalidateReadingBlockQueries, measurementsAdminKeys } from "../api/keys";

function replaceById<T extends { id: number | string }>(items: T[] | undefined, item: T): T[] | undefined {
  return items?.map((candidate) => (candidate.id === item.id ? item : candidate));
}

export async function storeReadingBlock(queryClient: QueryClient, block: MeasurementReadingBlock): Promise<void> {
  queryClient.setQueryData<MeasurementReadingBlock[]>(measurementsAdminKeys.readingBlocks(), (blocks) => replaceById(blocks, block));
  await invalidateReadingBlockQueries(queryClient);
}

export async function storeQuirkRule(queryClient: QueryClient, rule: MeasurementQuirkRule): Promise<void> {
  queryClient.setQueryData<MeasurementQuirkRule[]>(measurementsAdminKeys.quirkRules(), (rules) => replaceById(rules, rule));
  await invalidateReadingBlockQueries(queryClient);
}
