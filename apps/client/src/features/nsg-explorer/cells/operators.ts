import type { NsgCell, NsgEvent } from "@/lib/nsg-parser/model";
import {
  type OperatorContext,
  type ResolvedOperator as ParserResolvedOperator,
  createOperatorLookup,
  resolveCellOperator,
} from "@/lib/nsg-parser/operators";

export type ResolvedOperator = ParserResolvedOperator;

export type OperatorResolver = {
  get: (context: OperatorContext) => ResolvedOperator | null;
  resolveCell: (cell: NsgCell) => ResolvedOperator | null;
};

export function getCellOperator(cell: Pick<NsgCell, "mcc" | "mnc"> & Partial<Pick<NsgCell, "operatorName">>): ResolvedOperator | null {
  return resolveCellOperator(cell);
}

export function getPlmnNumber(cell: Pick<NsgCell, "mcc" | "mnc">): number | null {
  const operator = getCellOperator(cell);
  return operator === null ? null : Number(operator.plmn);
}

export function collectRegisteredOperatorMncs(cells: readonly Pick<NsgCell, "registered" | "mcc" | "mnc">[]): number[] {
  const operatorMncs = new Set<number>();
  for (const cell of cells) {
    if (cell.registered !== true) continue;
    const plmn = getPlmnNumber(cell);
    if (plmn !== null) operatorMncs.add(plmn);
  }
  return [...operatorMncs].sort((left, right) => left - right);
}

export function createOperatorResolver(events: readonly NsgEvent[]): OperatorResolver {
  const lookup = createOperatorLookup(events);
  return {
    get: (context) => lookup.get(context),
    resolveCell: getCellOperator,
  };
}
