import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { type GalleryTile, listTilePlaces } from "../galleryTiles";
import { findOperator, operatorsQueryOptions } from "@/features/shared/lookups";
import { getLocationLabel } from "@/features/station-details/station/utils/stations";

export function PhotoStationsInfo({ tiles }: { tiles: GalleryTile[] }) {
  const { t } = useTranslation("main");
  const { data: operators } = useQuery(operatorsQueryOptions());
  const mainCount = tiles.filter((tile) => tile.isMain).length;
  const marksMainStations = mainCount > 0 && mainCount < tiles.length;

  return (
    <>
      {listTilePlaces(tiles).map(({ location, tiles: placeTiles }, placeIndex) => (
        <Fragment key={location.id}>
          {placeIndex > 0 ? "; " : null}
          {placeTiles.map(({ station, isMain }, stationIndex) => {
            const stationOperator = findOperator(operators, station.operatorId);

            return (
              <Fragment key={station.id}>
                {stationIndex > 0 ? ", " : null}
                {marksMainStations && isMain ? (
                  <>
                    <HugeiconsIcon icon={StarIcon} className="mr-1 inline size-3 text-yellow-400" aria-hidden="true" />
                    <span className="sr-only">{t("photos.mainPhoto")}: </span>
                  </>
                ) : null}
                {stationOperator ? `${stationOperator.name} ` : null}
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
