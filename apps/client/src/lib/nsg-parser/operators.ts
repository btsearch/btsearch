import { type OperatorContext, OperatorHistory, type ResolvedOperator, resolveCellOperator } from "./internal/operatorState";
import type { NsgEvent } from "./model";

export type { OperatorContext, ResolvedOperator };
export { resolveCellOperator };

export function createOperatorLookup(events: readonly NsgEvent[]): Readonly<{ get: (context: OperatorContext) => ResolvedOperator | null }> {
  const history = new OperatorHistory(events);
  return { get: (context) => history.get(context) };
}
