import type { OfficialPermitLabel } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { toOfficialRatFilter, toOfficialRatOption } from "@/features/official/labels";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";

export function OfficialBandLabel({ label }: { label: OfficialPermitLabel }) {
  const { t } = useTranslation("stations");
  const rat = toOfficialRatFilter(label);
  const ratOption = rat === null ? null : toOfficialRatOption(rat);

  return (
    <>
      {ratOption === null ? null : <GenerationTag>{ratOption.gen}</GenerationTag>}
      <span>{label.name ?? ratOption?.label ?? "-"}</span>
      {label.name === null && ratOption !== null ? <span className="font-normal text-muted-foreground">{t("cells.unknownBand")}</span> : null}
    </>
  );
}
