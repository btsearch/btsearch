import { useContext } from "react";
import { useTranslation } from "react-i18next";

import type { ResolvedOperator } from "@/features/nsg-explorer/cells/operators";
import { OperatorBrandCatalogContext } from "@/features/shared/operatorBrandCatalog";
import { findOperatorForPlmn } from "@/features/shared/operatorBrands";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";

export function OperatorName({ operator, labelClassName }: { operator: ResolvedOperator | null; labelClassName?: string }) {
  const { t } = useTranslation("main");
  const { operators, brands } = useContext(OperatorBrandCatalogContext);
  const catalogOperator = findOperatorForPlmn(operators, operator?.plmn);
  const label = catalogOperator?.name ?? operator?.name ?? operator?.plmn ?? t("unknownOperator");

  return <DialogOperatorName name={label} brand={getOperatorBrand(catalogOperator, brands)} compact labelClassName={labelClassName} />;
}
