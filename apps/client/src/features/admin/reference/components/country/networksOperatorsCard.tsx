import { ArrowRight01Icon, CellularNetworkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Brand, Country, Operator } from "../../types";
import { formatPlmn } from "../../utils/plmn";
import { OperatorCreateDialog } from "../operators/operatorCreateDialog";
import { BrandTile } from "../shared/brandTile";
import { CardAddButton, CardLoadState, CountBadge } from "../shared/cardParts";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader } from "../shared/referenceCards";
import { MONO_TEXT_CLASS } from "../shared/values";
import { NETWORKS_ROW_CLASS, NETWORKS_ROW_ITEM_CLASS, NETWORKS_ROW_LINK_CLASS, NetworksTileSkeleton } from "./networksCardParts";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

type NetworksOperatorsCardProps = {
  country: Country;
  canEdit: boolean;
};

type OperatorRowProps = {
  operator: Operator;
  brand?: Brand;
  isBrandPending: boolean;
  isLinked: boolean;
};

const SKELETON_ROW_COUNT = 3;

function OperatorRow({ operator, brand, isBrandPending, isLinked }: OperatorRowProps) {
  const { t } = useTranslation("admin");
  const plmn = operator.primaryPlmn === null ? null : formatPlmn(operator.primaryPlmn);
  const plmnLabel = plmn === null ? undefined : t("reference.country.networks.operators.primaryPlmn", { plmn });
  const summary = (
    <>
      {isBrandPending ? <NetworksTileSkeleton /> : <BrandTile brand={brand} size={32} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-5 font-medium">{operator.name}</span>
        <span className="block truncate text-xs leading-4 text-muted-foreground">{operator.legalName}</span>
      </span>
      {plmn === null ? null : (
        <span title={plmnLabel} className={cn("shrink-0 text-muted-foreground", MONO_TEXT_CLASS)}>
          <span aria-hidden="true">{plmn}</span>
          <span className="sr-only">{plmnLabel}</span>
        </span>
      )}
    </>
  );

  if (!isLinked) return <div className={NETWORKS_ROW_CLASS}>{summary}</div>;

  return (
    <Link to="/admin/operators/$id" params={{ id: String(operator.id) }} className={cn(NETWORKS_ROW_CLASS, NETWORKS_ROW_LINK_CLASS)}>
      {summary}
      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function NetworksOperatorsCard({ country, canEdit }: NetworksOperatorsCardProps) {
  const { t, i18n } = useTranslation("admin");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: operators, isError, isFetching, refetch } = useQuery(operatorsQueryOptions());
  const { data: brands, isError: hasBrandsLoadFailed } = useQuery(brandsQueryOptions());

  const countryOperators = operators?.filter((operator) => operator.countryCode === country.code);
  const brandsById = new Map((brands ?? []).map((brand) => [brand.id, brand]));
  const isBrandListPending = brands === undefined && !hasBrandsLoadFailed;
  const addLabel = t("reference.country.networks.operators.add");

  function openCreateDialog() {
    setIsCreateOpen(true);
  }

  let body: ReactNode;
  if (countryOperators === undefined) {
    body = (
      <CardLoadState
        hasLoadFailed={isError}
        errorTitle={t("reference.country.networks.operators.loadFailed")}
        isRetrying={isFetching}
        onRetry={() => void refetch()}
        skeletonRowCount={SKELETON_ROW_COUNT}
      />
    );
  } else if (countryOperators.length === 0) {
    body = (
      <CenteredCardState
        icon={CellularNetworkIcon}
        title={t("reference.country.networks.operators.empty.title")}
        description={
          canEdit ? t("reference.country.networks.operators.empty.description") : t("reference.country.networks.operators.empty.readOnlyDescription")
        }
        action={canEdit ? <CardAddButton variant="outline" label={addLabel} onClick={openCreateDialog} /> : null}
      />
    );
  } else {
    body = (
      <ul className="border-t">
        {countryOperators.map((operator) => (
          <li key={operator.id} className={NETWORKS_ROW_ITEM_CLASS}>
            <OperatorRow
              operator={operator}
              brand={operator.brandId === null ? undefined : brandsById.get(operator.brandId)}
              isBrandPending={operator.brandId !== null && isBrandListPending}
              isLinked={canEdit}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("nav:items.operators")}
        description={t("reference.country.networks.operators.description")}
        badge={countryOperators === undefined ? null : <CountBadge>{countryOperators.length.toLocaleString(i18n.language)}</CountBadge>}
        action={canEdit ? <CardAddButton label={addLabel} isCompactOnPhones onClick={openCreateDialog} /> : null}
      />
      {body}
      {canEdit ? <OperatorCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} countryCode={country.code} /> : null}
    </ReferenceCard>
  );
}
