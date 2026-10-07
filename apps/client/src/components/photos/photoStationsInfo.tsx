import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Operator, StationBase, StationLocation } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { findOperator, operatorsQueryOptions } from "@/features/shared/lookups";
import { getLocationLabel } from "@/features/station-details/station/utils/stations";

type PhotoStationsPlace = {
  location: Pick<StationLocation, "id" | "city" | "address">;
  selections: readonly {
    station: Pick<StationBase, "id" | "siteId" | "operatorId"> & { operator?: Pick<Operator, "name"> | null };
    isMain: boolean;
  }[];
};

export function PhotoStationsInfo({ places }: { places: readonly PhotoStationsPlace[] }) {
  const { t } = useTranslation("main");
  const { data: operators } = useQuery(operatorsQueryOptions());
  const hasMainSelection = places.some((place) => place.selections.some((selection) => selection.isMain));
  const hasNonMainSelection = places.some((place) => place.selections.some((selection) => !selection.isMain));
  const marksMainStations = hasMainSelection && hasNonMainSelection;

  return (
    <>
      {places.map(({ location, selections: placeSelections }, placeIndex) => (
        <Fragment key={location.id}>
          {placeIndex > 0 ? "; " : null}
          {placeSelections.map(({ station, isMain }, stationIndex) => {
            const operatorName = station.operator?.name ?? findOperator(operators, station.operatorId)?.name;

            return (
              <Fragment key={station.id}>
                {stationIndex > 0 ? ", " : null}
                {marksMainStations && isMain ? (
                  <>
                    <HugeiconsIcon icon={StarIcon} className="mr-1 inline size-3 text-yellow-400" aria-hidden="true" />
                    <span className="sr-only">{t("photos.mainPhoto")}: </span>
                  </>
                ) : null}
                {operatorName ? `${operatorName} ` : null}
                <Link
                  to="/stations/$id"
                  params={{ id: String(station.id) }}
                  className="font-mono font-medium text-white/80 tabular-nums underline-offset-2 hover:text-white hover:underline"
                >
                  {station.siteId}
                </Link>
              </Fragment>
            );
          })}
          {` · ${getLocationLabel(location) ?? t("photos.locationNumber", { id: location.id })}`}
        </Fragment>
      ))}
    </>
  );
}
