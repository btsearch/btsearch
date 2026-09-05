import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getMnoBrand } from "@/lib/cellular/operators";
import type { ExtraIdentificator } from "@/types/station";

import { CopyButton } from "./copyButton";
import NetWorksIcon from "./logos/networks.svg?react";
import OrangeIcon from "./logos/orange.svg?react";
import PlayIcon from "./logos/play.svg?react";
import PlusIcon from "./logos/plus.svg?react";
import TmobileIcon from "./logos/t-mobile.svg?react";
import { StationInfoItem } from "./stationInfoItem";

type ExtraIdentificatorsDisplayProps = {
  data: ExtraIdentificator;
  operatorMnc?: number | null;
};

const MNO_LOGO: Partial<Record<string, typeof OrangeIcon>> = {
  OPL: OrangeIcon,
  TMPL: TmobileIcon,
  Plus: PlusIcon,
  Play: PlayIcon,
};

export function ExtraIdentificatorsDisplay({ data, operatorMnc }: ExtraIdentificatorsDisplayProps) {
  const { t } = useTranslation("common");
  const brand = getMnoBrand(operatorMnc);
  const mnoLabel = t("labels.mnoName", { brand });
  const MNOLogo = MNO_LOGO[brand];

  return (
    <>
      {data.networks_id ? (
        <StationInfoItem icon={<NetWorksIcon className="size-4" />} label={t("labels.networksId")}>
          <span className="font-mono">{data.networks_id}</span>
          <CopyButton text={String(data.networks_id)} />
        </StationInfoItem>
      ) : null}
      {data.networks_name && (
        <StationInfoItem icon={<NetWorksIcon className="size-4" />} label={t("labels.networksName")}>
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 truncate" />}>{data.networks_name}</TooltipTrigger>
            <TooltipContent>{data.networks_name}</TooltipContent>
          </Tooltip>
          <CopyButton text={data.networks_name} />
        </StationInfoItem>
      )}
      {data.mno_name && (
        <StationInfoItem icon={MNOLogo ? <MNOLogo className="h-5 w-auto max-w-20" /> : <NetWorksIcon className="size-4" />} label={mnoLabel}>
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 truncate" />}>{data.mno_name}</TooltipTrigger>
            <TooltipContent>{data.mno_name}</TooltipContent>
          </Tooltip>
        </StationInfoItem>
      )}
    </>
  );
}
