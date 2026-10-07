import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { CopyButton } from "../../../components/copyButton";
import NetWorksIcon from "../../../components/logos/networks.svg?react";
import { StationInfoItem } from "../../../components/stationInfoItem";
import type { Operator, StationIdentifier } from "../../types";
import { getOperatorBrand } from "../../utils/brands";
import { NETWORKS_ID_KIND, findStationIdentifier, getOperatorShortLabel } from "../../utils/stations";
import { BrandLead } from "./brandLead";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { brandsQueryOptions } from "@/features/shared/lookups";

const GENERIC_OPERATOR_CODE = "MNO";

type SiteIdItemProps = {
  siteId: string;
};

type IdentifierItemsProps = {
  identifiers: readonly StationIdentifier[];
  operator: Operator | null;
};

type OperatorNameItemProps = {
  name: string;
  operator: Operator | null;
};

export function SiteIdItem({ siteId }: SiteIdItemProps) {
  const { t } = useTranslation("common");

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={Tag01Icon} aria-hidden="true" className="size-4" />} label={t("labels.stationId")}>
      <span className="font-mono">{siteId}</span>
      <CopyButton text={siteId} fieldLabel={t("labels.stationId")} />
    </StationInfoItem>
  );
}

export function IdentifierItems({ identifiers, operator }: IdentifierItemsProps) {
  const { t } = useTranslation("common");
  const networksId = findStationIdentifier(identifiers, NETWORKS_ID_KIND);
  const networksName = findStationIdentifier(identifiers, "networksName");
  const operatorName = findStationIdentifier(identifiers, "operatorName");

  return (
    <>
      {networksId ? (
        <StationInfoItem icon={<NetWorksIcon aria-hidden="true" className="size-4" />} label={t("labels.networksId")}>
          <span className="font-mono">{networksId}</span>
          <CopyButton text={networksId} fieldLabel={t("labels.networksId")} />
        </StationInfoItem>
      ) : null}
      {networksName ? (
        <StationInfoItem icon={<NetWorksIcon aria-hidden="true" className="size-4" />} label={t("labels.networksName")}>
          <div className="flex min-w-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger render={<span className="min-w-0 truncate" />}>{networksName}</TooltipTrigger>
              <TooltipContent>{networksName}</TooltipContent>
            </Tooltip>
            <CopyButton text={networksName} fieldLabel={t("labels.networksName")} />
          </div>
        </StationInfoItem>
      ) : null}
      {operatorName ? <OperatorNameItem name={operatorName} operator={operator} /> : null}
    </>
  );
}

function OperatorNameItem({ name, operator }: OperatorNameItemProps) {
  const { t } = useTranslation("common");
  const { data: brands, isPending: isBrandsPending } = useQuery(brandsQueryOptions());
  const brand = getOperatorBrand(operator, brands);
  const isBrandPending = isBrandsPending && operator !== null && operator.brandId !== null;
  const operatorCode = getOperatorShortLabel(operator) ?? GENERIC_OPERATOR_CODE;

  return (
    <StationInfoItem icon={<BrandLead brand={brand} isPending={isBrandPending} />} label={t("labels.mnoName", { brand: operatorCode })}>
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 truncate" />}>{name}</TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    </StationInfoItem>
  );
}
