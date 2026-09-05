import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { operatorsQueryOptions } from "@/features/shared/queries";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import type { NsgResolvedOperator } from "@/lib/nsg/operator";

export function OperatorName({ operator, labelClassName }: { operator: NsgResolvedOperator | null; labelClassName?: string }) {
  const { t } = useTranslation("main");
  const { data: operators } = useQuery(operatorsQueryOptions());
  const plmn = operator === null ? null : Number(operator.plmn);
  const knownOperator = operators?.find((item) => item.mnc === plmn);

  return (
    <DialogOperatorName name={knownOperator?.name ?? operator?.name ?? t("unknownOperator")} mnc={plmn} compact labelClassName={labelClassName} />
  );
}
