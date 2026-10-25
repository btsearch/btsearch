import { AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

import { type MapLookups, getOperatorLook } from "../../data/mapLookups";
import { isObservationCountryPrivate } from "../access/countryPrivacy";
import type { CrowdAccess } from "../access/useCrowdAccess";
import { CrowdCardFrame } from "../card/crowdCardFrame";
import type { CrowdTheme } from "../style/palette";
import { MeasuredCoverageCard } from "./coverageCard";
import { CoverageCellLabels } from "./coverageCellLabels";
import { useMeasuredCoverage } from "./coverageStore";
import { useMeasuredCoverageLayers } from "./useMeasuredCoverageLayers";
import { useMeasuredCoverageView } from "./useMeasuredCoverageView";
import { useMap } from "@/components/ui/map";

type MeasuredCoverageLayerProps = {
  access: CrowdAccess;
  lookups: MapLookups | undefined;
  theme: CrowdTheme;
  isPickingReceiver: boolean;
};

export function MeasuredCoverageLayer({ access, lookups, theme, isPickingReceiver }: MeasuredCoverageLayerProps) {
  const { t } = useTranslation("main");
  const { map, isLoaded } = useMap();
  const storedCoverage = useMeasuredCoverage();
  const coverage = access.isAvailable ? storedCoverage : null;
  const coverageView = useMeasuredCoverageView(coverage, lookups?.bandsById);
  const countryCode = coverage?.target.kind === "station" ? coverage.target.countryCode : null;
  const isCountryPrivate = !access.isAdmin && isObservationCountryPrivate(lookups?.countries, countryCode);

  const squares = useMeasuredCoverageLayers({
    map,
    isLoaded,
    coverage,
    view: coverageView.view,
    theme,
    isStaff: access.isStaff,
    operatorColor: getOperatorLook(lookups, coverage?.target.operatorId).color,
    isPickingReceiver,
  });

  let error: { onRetry: () => void; isRetrying: boolean } | null = null;
  if (coverageView.isError) error = { onRetry: coverageView.retry, isRetrying: coverageView.isRetrying };
  else if (squares.status === "error") error = { onRetry: squares.retry, isRetrying: false };

  return (
    <>
      <CoverageCellLabels target={coverage?.target ?? null} view={coverageView.view} />
      <AnimatePresence>
        {coverage === null ? null : (
          <CrowdCardFrame key="coverage" label={t("crowd.coverage.title")}>
            <MeasuredCoverageCard
              theme={theme}
              coverage={coverage}
              view={coverageView.view}
              lookups={lookups}
              isLoading={coverageView.isLoading || squares.status === "loading"}
              isZoomedOut={squares.status === "idle"}
              error={error}
              isCountryPrivate={isCountryPrivate}
            />
          </CrowdCardFrame>
        )}
      </AnimatePresence>
    </>
  );
}
