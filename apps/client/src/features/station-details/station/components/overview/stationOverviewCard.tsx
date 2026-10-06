import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { NavigationLinks } from "../../../components/navLinks";
import { StationInfoItemSkeleton } from "../../../components/stationInfoItem";
import type { StationLocationRecord, StationRecord, Structure } from "../../types";
import { BackhaulItem } from "./backhaulItem";
import { EmfReportsItem } from "./emfReportsItem";
import { IdentifierItems, SiteIdItem } from "./identifierItems";
import { CoordinatesItem, ElevationItem, RegionItem } from "./locationItems";
import { StructureNoteItem, StructureOwnerItem, StructureTypeItem } from "./structureItems";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLocationMapHash } from "@/features/map/mapLinks";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

const CARD_CLASS = "space-y-4 rounded-xl border p-3 @lg:p-4";
const GRID_CLASS = "grid grid-cols-1 gap-4 @md:grid-cols-2 @lg:gap-x-6 @3xl:grid-cols-3";
const LINKS_CLASS = "flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3";
const MAP_LINK_CLASS = cn(
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground",
  "hover:text-foreground hover:bg-muted transition-colors cursor-pointer",
);
const NO_STRUCTURE: Structure = { type: null, owner: null, note: null };

type StationOverviewCardProps = {
  station: StationRecord;
  onClose: () => void;
};

type StationOverviewGridProps = {
  station: StationRecord;
};

type OverviewLinksProps = {
  location: StationLocationRecord;
  onClose: () => void;
};

export function StationOverviewCard({ station, onClose }: StationOverviewCardProps) {
  return (
    <section className="@container">
      <div className={CARD_CLASS}>
        <StationOverviewGrid station={station} />
        {station.location !== null ? <OverviewLinks location={station.location} onClose={onClose} /> : null}
      </div>
    </section>
  );
}

export function StationOverviewGrid({ station }: StationOverviewGridProps): ReactNode {
  const { siteId, location, operator, backhaul, identifiers } = station;
  const structure = location?.structure ?? NO_STRUCTURE;

  return (
    <div className={GRID_CLASS}>
      {location !== null ? <CoordinatesItem latitude={location.latitude} longitude={location.longitude} /> : null}
      {location !== null ? <RegionItem countryCode={location.countryCode} regionName={location.region.name} /> : null}
      <SiteIdItem siteId={siteId} />
      {structure.type !== null ? <StructureTypeItem type={structure.type} /> : null}
      {structure.owner !== null ? <StructureOwnerItem owner={structure.owner} /> : null}
      <EmfReportsItem station={station} />
      <IdentifierItems identifiers={identifiers} operator={operator} />
      {structure.note ? <StructureNoteItem note={structure.note} /> : null}
      {backhaul !== null ? <BackhaulItem backhaul={backhaul} /> : null}
      {location !== null ? <ElevationItem latitude={location.latitude} longitude={location.longitude} /> : null}
    </div>
  );
}

export function StationOverviewCardSkeleton() {
  const { preferences, isMapLinkShown, navigationApps } = useOverviewLinks();
  const hasInlineNavLinks = preferences.navLinksDisplay === "inline" && preferences.navigationApps.length > 0;

  return (
    <section className="@container">
      <div className={CARD_CLASS}>
        <div className={GRID_CLASS}>
          <StationInfoItemSkeleton valueClassName="w-36" lineClassName={hasInlineNavLinks ? "h-6" : "h-5.5"} />
          <StationInfoItemSkeleton valueClassName="w-24" />
          <StationInfoItemSkeleton valueClassName="w-20" lineClassName="h-5.5" />
          <StationInfoItemSkeleton valueClassName="w-28" />
          <StationInfoItemSkeleton valueClassName="w-32" />
          <StationInfoItemSkeleton valueClassName="w-20" />
        </div>
        {isMapLinkShown || navigationApps.length > 0 ? (
          <div className={LINKS_CLASS}>
            {isMapLinkShown ? <Skeleton className="h-6.5 w-28" /> : null}
            {navigationApps.map((app) => (
              <Skeleton key={app} className="h-6.5 w-24" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OverviewLinks({ location, onClose }: OverviewLinksProps) {
  const { t } = useTranslation("common");
  const { isMapLinkShown, navigationApps } = useOverviewLinks();

  if (!isMapLinkShown && navigationApps.length === 0) return null;

  return (
    <div className={LINKS_CLASS}>
      {isMapLinkShown ? (
        <Tooltip>
          <TooltipTrigger render={<Link to="/" hash={getLocationMapHash(location)} className={MAP_LINK_CLASS} onClick={onClose} />}>
            <HugeiconsIcon icon={MapsLocation01Icon} aria-hidden="true" className="size-3.5" />
            {t("actions.showOnMap")}
          </TooltipTrigger>
          <TooltipContent>{t("actions.showOnMap")}</TooltipContent>
        </Tooltip>
      ) : null}
      {navigationApps.length > 0 ? <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="buttons" /> : null}
    </div>
  );
}

function useOverviewLinks() {
  const { preferences } = usePreferences();
  const isOnMap = useLocation({ select: ({ pathname }) => pathname === "/" || pathname.startsWith("/lists/") });

  return {
    preferences,
    isMapLinkShown: !isOnMap,
    navigationApps: preferences.navLinksDisplay === "buttons" ? preferences.navigationApps : [],
  };
}
