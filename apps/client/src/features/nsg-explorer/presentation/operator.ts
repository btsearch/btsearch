import type { ResolvedOperator } from "@/features/nsg-explorer/cells/operators";

type CatalogOperator = {
  name: string;
  mnc: number | null;
};

export type OperatorPresentation = {
  label: string | null;
  numericPlmn: number | null;
};

export function getOperatorPresentation(
  operator: Pick<ResolvedOperator, "name" | "plmn"> | null,
  catalogOperators: readonly CatalogOperator[] | undefined,
): OperatorPresentation {
  if (operator === null) return { label: null, numericPlmn: null };

  const numericPlmn = Number(operator.plmn);
  const catalogName = catalogOperators?.find((item) => item.mnc === numericPlmn)?.name;

  return {
    label: catalogName ?? operator.name ?? operator.plmn,
    numericPlmn,
  };
}
