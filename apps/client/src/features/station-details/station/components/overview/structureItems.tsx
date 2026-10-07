import { Building03Icon, Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { StationInfoItem } from "../../../components/stationInfoItem";
import type { StructureOwnerRef, StructureType } from "../../types";
import { getStructureOwnerBrand, getStructureTypeKey } from "../../utils/structure";
import { StructureTypeIcon } from "../structureTypeIcon";
import { BrandLead } from "./brandLead";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";

type StructureTypeItemProps = {
  type: StructureType;
};

type StructureOwnerItemProps = {
  owner: StructureOwnerRef | null;
};

type StructureOwnerLeadProps = {
  owner: StructureOwnerRef;
};

type StructureNoteItemProps = {
  note: string;
};

export function StructureTypeItem({ type }: StructureTypeItemProps) {
  const { t } = useTranslation("common");

  return (
    <StationInfoItem icon={<StructureTypeIcon type={type} className="size-4" />} label={t("structure.type")}>
      <span>{t(getStructureTypeKey(type))}</span>
    </StationInfoItem>
  );
}

export function StructureOwnerItem({ owner }: StructureOwnerItemProps) {
  const { t } = useTranslation("common");

  if (owner === null) {
    return (
      <StationInfoItem icon={<OwnerIcon />} label={t("structure.owner")}>
        <span className="font-normal text-muted-foreground">{t("labels.unknown")}</span>
      </StationInfoItem>
    );
  }

  return (
    <StationInfoItem icon={<StructureOwnerLead owner={owner} />} label={t("structure.owner")}>
      <span>{owner.name}</span>
    </StationInfoItem>
  );
}

export function StructureNoteItem({ note }: StructureNoteItemProps) {
  const { t } = useTranslation("common");

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={Note01Icon} aria-hidden="true" className="size-4" />} label={t("structure.note")}>
      <span className="min-w-0 font-normal wrap-break-word">{note}</span>
    </StationInfoItem>
  );
}

function StructureOwnerLead({ owner }: StructureOwnerLeadProps) {
  const { data: brands, isPending: isBrandsPending } = useQuery(brandsQueryOptions());
  const { data: operators, isPending: isOperatorsPending } = useQuery(operatorsQueryOptions());
  const brand = getStructureOwnerBrand(owner, brands, operators);
  const canHaveBrand = owner.brandId !== null || owner.operatorId !== null;
  const isBrandPending = canHaveBrand && (isBrandsPending || isOperatorsPending);

  if (brand === null && !isBrandPending) return <OwnerIcon />;
  return <BrandLead brand={brand} isPending={isBrandPending} />;
}

function OwnerIcon() {
  return <HugeiconsIcon icon={Building03Icon} aria-hidden="true" className="size-4" />;
}
