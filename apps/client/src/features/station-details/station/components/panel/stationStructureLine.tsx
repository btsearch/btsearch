import { getStructurePhrase } from "@openbts/shared/structureNotes";
import { useTranslation } from "react-i18next";

import type { Brand, StationLocationRecord } from "../../types";
import { getStructureNoteLanguage, getStructureTypeKey } from "../../utils/structure";
import { StructureTypeIcon } from "../structureTypeIcon";
import { BrandMark } from "@/components/cellular/brandMark";

type StationStructureLineProps = {
  location: Pick<StationLocationRecord, "address" | "structure"> | null;
  ownerBrand: Brand | null;
  showNote?: boolean;
};

function MiddleDot() {
  return (
    <span aria-hidden="true" className="text-muted-foreground/40">
      ·
    </span>
  );
}

export function StationStructureLine({ location, ownerBrand, showNote = false }: StationStructureLineProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const address = location?.address || null;
  const structureType = location?.structure.type ?? null;
  const owner = location?.structure.owner ?? null;
  const note = showNote ? location?.structure.note || null : null;
  const typeName = structureType === null ? null : t(getStructureTypeKey(structureType));
  const typePhrase =
    structureType !== null && typeName !== null && note !== null
      ? getStructurePhrase(typeName, structureType, note, getStructureNoteLanguage(i18n.language))
      : null;

  if (address === null && structureType === null && owner === null && note === null) return <>{t("dialog.btsStation")}</>;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {address !== null ? <span>{address}</span> : null}
      {structureType !== null ? (
        <>
          {address !== null ? <MiddleDot /> : null}
          <span className="inline-flex max-w-full min-w-0 items-center gap-1">
            <StructureTypeIcon type={structureType} className="size-3 shrink-0" />
            <span className="min-w-0 wrap-break-word">{typePhrase ?? typeName}</span>
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
      {note !== null && typePhrase === null ? (
        <>
          {address !== null || structureType !== null || owner !== null ? <MiddleDot /> : null}
          <span className="min-w-0 max-w-full wrap-break-word">{note}</span>
        </>
      ) : null}
    </span>
  );
}
