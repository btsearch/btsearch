import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { NumberedStation } from "@/features/station-details/station/utils/stations";
import { ListIconMark } from "@/features/stations/list/components/table/listCells";

type StationNumberMarkProps = {
  station: NumberedStation;
};

function getStationNumberNoteKey(nodeName: string | null) {
  if (nodeName === null) return "stationNumber.none";
  if (nodeName.startsWith("4G")) return "stationNumber.enb";
  if (nodeName.startsWith("5G")) return "stationNumber.gnb";
  return "stationNumber.cell";
}

export function StationNumberMark({ station }: StationNumberMarkProps) {
  const { t } = useTranslation("common");

  if (station.siteId !== null) return null;

  return <ListIconMark icon={InformationCircleIcon} label={t(getStationNumberNoteKey(station.nodeName))} />;
}
