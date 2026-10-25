import { isRecordId } from "@/lib/apiValues";

export type EvaluationSearch = {
  night?: number;
};

export function parseEvaluationSearch(search: Record<string, unknown>): EvaluationSearch {
  return { night: isRecordId(search.night) ? search.night : undefined };
}
