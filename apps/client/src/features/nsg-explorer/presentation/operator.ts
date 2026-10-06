import type { Operator } from "@openbts/shared/contract";

import type { ResolvedOperator } from "@/features/nsg-explorer/cells/operators";

export type OperatorPresentation = {
  label: string | null;
  numericPlmn: number | null;
};

export function getOperatorPresentation(
  operator: Pick<ResolvedOperator, "name" | "plmn"> | null,
  catalogOperators: readonly Pick<Operator, "name" | "plmns">[] | undefined,
): OperatorPresentation {
  if (operator === null) return { label: null, numericPlmn: null };

  const numericPlmn = Number(operator.plmn);
  const catalogName = catalogOperators?.find((item) => item.plmns.some((plmn) => plmn.plmn === operator.plmn))?.name;

  return {
    label: catalogName ?? operator.name ?? operator.plmn,
    numericPlmn,
  };
}
