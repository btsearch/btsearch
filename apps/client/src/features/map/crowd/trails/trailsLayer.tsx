import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type MapFilters, UNKNOWN_BAND_LABEL } from "../../data/mapFilters";
import type { MapLookups, MapOperator } from "../../data/mapLookups";
import { listCellRats } from "../../data/mapRequests";
import { isObservationCountryPrivate } from "../access/countryPrivacy";
import type { CrowdAccess } from "../access/useCrowdAccess";
import type { TrailTiles } from "../api/tiles";
import { CrowdCardFrame } from "../card/crowdCardFrame";
import type { CrowdTheme } from "../style/palette";
import { type TrailBandNote, TrailsCard, type TrailsPrivateNote } from "./trailsCard";
import { useTrailsLayers } from "./useTrailsLayers";
import { useMap } from "@/components/ui/map";
import { getBandCode } from "@/features/station-details/station/utils/bands";

type TrailsLayerProps = {
  isShown: boolean;
  filters: MapFilters;
  lookups: MapLookups | undefined;
  countryCode: string | null;
  access: CrowdAccess;
  theme: CrowdTheme;
};

const TRAIL_TAB_COUNT = 4;
const NO_OPERATORS: MapOperator[] = [];

function pickTrailOperatorId(
  operators: readonly MapOperator[],
  filteredOperatorIds: readonly number[],
  chosenOperatorId: number | null,
): number | null {
  const isListed = (operatorId: number | null) => operators.some((entry) => entry.operator.id === operatorId);
  if (isListed(chosenOperatorId)) return chosenOperatorId;
  return filteredOperatorIds.find(isListed) ?? operators.at(0)?.operator.id ?? null;
}

function readTrailKind(showsMine: boolean, isAdmin: boolean): TrailTiles["kind"] {
  if (showsMine) return "mine";
  return isAdmin ? "staff" : "public";
}

function listTrailBandNotes(labels: readonly number[], lookups: MapLookups | undefined, unknownBand: string): TrailBandNote[] {
  return labels.map((label) => {
    if (label === UNKNOWN_BAND_LABEL) return { label, mhz: unknownBand, codes: "" };
    const codes = new Set((lookups?.bands ?? []).filter((band) => band.labelMhz === label).flatMap((band) => getBandCode(band) ?? []));
    return { label, mhz: String(label), codes: [...codes].sort().join("/") };
  });
}

export function TrailsLayer({ isShown, filters, lookups, countryCode, access, theme }: TrailsLayerProps) {
  const { t } = useTranslation("main");
  const { map, isLoaded } = useMap();
  const [chosenOperatorId, setChosenOperatorId] = useState<number | null>(null);
  const [isMine, setIsMine] = useState(false);

  const countryOperators = countryCode === null ? undefined : lookups?.operatorGroups.get(countryCode)?.main;
  const operators = (countryOperators ?? NO_OPERATORS).slice(0, TRAIL_TAB_COUNT);
  const operatorId = pickTrailOperatorId(operators, filters.operatorIds, chosenOperatorId);
  const isCountryPrivate = isObservationCountryPrivate(lookups?.countries, countryCode);
  const canShowMine = access.isSignedIn && (!isCountryPrivate || access.isAdmin);
  const showsMine = isMine && canShowMine;
  const canFetch = showsMine || !isCountryPrivate || access.isAdmin;
  const tiles: TrailTiles | null = isShown && canFetch && operatorId !== null ? { kind: readTrailKind(showsMine, access.isAdmin), operatorId } : null;
  let privateNote: TrailsPrivateNote | null = null;
  if (isCountryPrivate) privateNote = access.isAdmin ? "admin" : "guest";

  const trails = useTrailsLayers({ map, isLoaded, theme, tiles, bandLabels: filters.bands, bands: lookups?.bands, rats: listCellRats(filters.rat) });

  return (
    <AnimatePresence>
      {isShown ? (
        <CrowdCardFrame key="trails" label={t("crowd.trails.title")}>
          <TrailsCard
            theme={theme}
            operators={operators}
            operatorId={operatorId}
            onOperatorChange={setChosenOperatorId}
            canShowMine={canShowMine}
            isMine={showsMine}
            onMineChange={setIsMine}
            status={trails.status}
            isZoomedOut={tiles !== null && trails.status === "idle"}
            onRetry={trails.retry}
            bandNotes={listTrailBandNotes(filters.bands, lookups, t("crowd.unknownBand"))}
            privateNote={privateNote}
          />
        </CrowdCardFrame>
      ) : null}
    </AnimatePresence>
  );
}
