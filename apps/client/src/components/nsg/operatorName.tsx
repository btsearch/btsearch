import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { ResolvedOperator } from "@/features/nsg-explorer/cells/operators";
import { getOperatorPresentation } from "@/features/nsg-explorer/presentation/operator";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";

export function OperatorName({ operator, labelClassName }: { operator: ResolvedOperator | null; labelClassName?: string }) {
  const { t } = useTranslation("main");
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { label, numericPlmn } = getOperatorPresentation(operator, operators);

  return <DialogOperatorName name={label ?? t("unknownOperator")} mnc={numericPlmn} compact labelClassName={labelClassName} />;
}
