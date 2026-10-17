import type { OfficialSource } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { OfficialSourceLogo } from "./officialSourceLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type OfficialSourceCreditProps = {
  sourceKey: string;
  source: OfficialSource | null;
};

export function OfficialSourceCredit({ sourceKey, source }: OfficialSourceCreditProps) {
  const { t } = useTranslation("stationDetails");
  const shortName = source?.shortName ?? "";

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help opacity-60 transition-opacity hover:opacity-100">
        <OfficialSourceLogo source={{ key: sourceKey, shortName }} className="h-3" />
        <span className="sr-only">{shortName}</span>
      </TooltipTrigger>
      {source === null ? null : (
        <TooltipContent>{t("permits.sourceAttribution", { authority: source.authority, source: source.shortName })}</TooltipContent>
      )}
    </Tooltip>
  );
}
