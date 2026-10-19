import { Radar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { SI2PEMReportsMenu } from "../../../components/si2pemReportsMenu";
import { StationInfoItem } from "../../../components/stationInfoItem";
import type { StationRecord } from "../../types";
import { toV1OperatorMnc } from "../../utils/stations";
import { hasCountryCapability } from "@/features/map/data/mapFilters";
import { countriesQueryOptions } from "@/features/shared/lookups";

type EmfReportsItemProps = {
  station: StationRecord;
};

export function EmfReportsItem({ station }: EmfReportsItemProps) {
  const { t } = useTranslation("stationDetails");
  const { data: countries } = useQuery(countriesQueryOptions());
  const { id, siteId, hostStationId, location, operator } = station;
  if (hostStationId !== null || siteId === null || location === null || operator === null) return null;
  if (!hasCountryCapability(countries, location.countryCode, "emf")) return null;

  const operatorMnc = toV1OperatorMnc(operator);
  if (operatorMnc === null) return null;

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={Radar01Icon} aria-hidden="true" className="size-4" />} label={t("specs.pemReports")}>
      <SI2PEMReportsMenu
        site={{ stationId: id }}
        siteId={siteId}
        operatorName={operator.name}
        operatorMnc={operatorMnc}
        place={{ city: location.city, address: location.address }}
      />
    </StationInfoItem>
  );
}
