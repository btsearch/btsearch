import { useTranslation } from "react-i18next";

import type { Brand, StationLocationRecord } from "../../types";
import { getStructureTypeKey } from "../../utils/structure";
import { StructureTypeIcon } from "../structureTypeIcon";
import { BrandMark } from "@/components/cellular/brandMark";

type StationStructureLineProps = {
  location: StationLocationRecord | null;
  ownerBrand: Brand | null;
};

function MiddleDot() {
  return (
    <span aria-hidden="true" className="text-muted-foreground/40">
      ·
    </span>
  );
}

export function StationStructureLine({ location, ownerBrand }: StationStructureLineProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const address = location?.address || null;
  const structureType = location?.structure.type ?? null;
  const owner = location?.structure.owner ?? null;

  if (address === null && structureType === null && owner === null) return <>{t("dialog.btsStation")}</>;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {address !== null ? <span>{address}</span> : null}
      {structureType !== null ? (
        <>
          {address !== null ? <MiddleDot /> : null}
          <span className="inline-flex items-center gap-1">
            <StructureTypeIcon type={structureType} className="size-3 shrink-0" />
            {t(getStructureTypeKey(structureType))}
          </span>
        </>
      ) : null}
      {owner !== null ? (
        <>
          {address !== null || structureType !== null ? <MiddleDot /> : null}
          <span className="inline-flex items-center gap-1">
            {ownerBrand !== null ? <BrandMark brand={ownerBrand} size={12} /> : null}
            {owner.name}
          </span>
        </>
      ) : null}
    </span>
  );
}
