import type { ObservedSitePlacement } from "@openbts/shared/contract";
import { formatDistance } from "@openbts/shared/geo";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { type MapLookups, getOperatorLook } from "../../data/mapLookups";
import { observedSiteQueryOptions } from "../api/observedQueries";
import { getEstimatedSiteName } from "./estimatedSites";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCountrySourceName } from "@/features/official/queries";

type SitePlacementLineProps = {
  placement: ObservedSitePlacement | null;
  countryCode: string | null;
  lookups: MapLookups | undefined;
};

type PlacementHintProps = {
  text: string | null;
  hint: string;
};

type OfficialSitePlacementProps = {
  address: string;
  countryCode: string | null;
  probability: number;
};

type EstimatedSitePlacementProps = {
  observedSiteId: number;
  probability: number;
  lookups: MapLookups | undefined;
};

const PERCENT = 100;

function toPercent(value: number): number {
  return Math.round(value * PERCENT);
}

function formatAddress(place: { address: string | null; city: string | null }): string {
  return [place.address, place.city].filter((part) => part !== null && part !== "").join(", ");
}

function PlacementHint({ text, hint }: PlacementHintProps) {
  if (text === null) return <Skeleton className="mt-1 h-3 w-40" />;
  return (
    <Tooltip>
      <TooltipTrigger render={<p className="w-fit cursor-help text-[11px] text-muted-foreground" />}>{text}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function OfficialSitePlacement({ address, countryCode, probability }: OfficialSitePlacementProps) {
  const { t } = useTranslation("main");
  const registerName = useCountrySourceName(countryCode);
  const text =
    registerName === null
      ? t("crowd.popup.onRegisterSite", { address, probability })
      : t("crowd.popup.onNamedRegisterSite", { register: registerName, address, probability });
  return <PlacementHint text={text} hint={t("crowd.popup.snapHint")} />;
}

function EstimatedSitePlacement({ observedSiteId, probability, lookups }: EstimatedSitePlacementProps) {
  const { t } = useTranslation("main");
  const { data: snappedSite } = useQuery(observedSiteQueryOptions(observedSiteId));
  let text: string | null = null;
  if (snappedSite !== undefined) {
    const operatorName = getOperatorLook(lookups, snappedSite.operatorId).operator?.name;
    const siteName = [operatorName, getEstimatedSiteName(snappedSite)].filter((part) => part !== undefined).join(" ");
    text = t("crowd.popup.onEstimatedSite", { site: siteName, probability });
  }
  return <PlacementHint text={text} hint={t("crowd.popup.snapHint")} />;
}

export function SitePlacementLine({ placement, countryCode, lookups }: SitePlacementLineProps) {
  const { t } = useTranslation("main");
  if (placement === null) return null;

  if (placement.kind === "fit") {
    const confidence = toPercent(placement.confidence);
    return (
      <PlacementHint
        text={t("crowd.popup.radius", { radius: formatDistance(placement.radiusMeters), confidence })}
        hint={t("crowd.popup.radiusHint", { confidence })}
      />
    );
  }

  const probability = toPercent(placement.probability);
  if (placement.kind === "location") {
    return <PlacementHint text={t("crowd.popup.onLocation", { address: formatAddress(placement), probability })} hint={t("crowd.popup.snapHint")} />;
  }
  if (placement.kind === "officialSite") {
    return <OfficialSitePlacement address={formatAddress(placement)} countryCode={countryCode} probability={probability} />;
  }
  return <EstimatedSitePlacement observedSiteId={placement.observedSiteId} probability={probability} lookups={lookups} />;
}
