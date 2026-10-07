import { LIST_DETAIL_SEPARATOR, ListCardDate, ListCountryTile, ListStructureLine } from "./listCells";
import { LIST_CARD_BODY_CLASS, LIST_CARD_CLASS, LIST_CARD_DETAIL_LINE_CLASS, LIST_CARD_LINK_CLASS, LIST_SKELETON_CARD_CLASS } from "./listTableRow";
import { STATION_ID_CLASS, StationLink, StationMarks, StationMatchLine, StationOperatorLine, getStationLabel } from "./stationsListCells";
import { STATIONS_CARD_HEIGHT_CLASSES } from "./stationsListLayout";
import { StationRowActions, type StationRowOpeners } from "./stationsListRowActions";
import { BrandMark } from "@/components/cellular/brandMark";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { HighlightedText } from "@/features/shared/HighlightedText";
import type { StationsListVariant } from "@/features/stations/list/data/stationsListFilters";
import type { StationsListRow } from "@/features/stations/list/data/stationsListRows";
import { cn } from "@/lib/utils";

type StationsListCardProps = {
  row: StationsListRow;
  variant: StationsListVariant;
  hasCountryTiles: boolean;
  openers: StationRowOpeners;
};

export function StationsListCard({ row, variant, hasCountryTiles, openers }: StationsListCardProps) {
  return (
    <li className={cn(LIST_CARD_CLASS, STATIONS_CARD_HEIGHT_CLASSES[variant])}>
      <StationLink row={row} variant={variant} className={LIST_CARD_LINK_CLASS} onWindowOpen={openers.openWindow}>
        <span className="sr-only">{getStationLabel(row)}</span>
      </StationLink>
      <div className={LIST_CARD_BODY_CLASS}>
        <div className="flex min-w-0 items-center gap-1.5">
          <BrandMark brand={row.brand} />
          <span className={cn(STATION_ID_CLASS, "shrink-0 group-hover/card:underline")}>
            <HighlightedText text={row.siteId} query={row.siteIdMark} />
          </span>
          <StationMarks row={row} />
          <StationOperatorLine row={row} />
          <ListCardDate updatedAt={row.updatedAt} />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm leading-5">
          {hasCountryTiles && row.countryCode !== null ? <ListCountryTile countryCode={row.countryCode} /> : null}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{row.city === null ? <EmptyValue /> : <HighlightedText text={row.city} query={row.cityMark} />}</span>
            {row.address === null ? null : (
              <span className="text-muted-foreground">
                {LIST_DETAIL_SEPARATOR}
                <HighlightedText text={row.address} query={row.addressMark} />
              </span>
            )}
          </span>
          {row.matchLine === null ? null : (
            <StationMatchLine matchLine={row.matchLine} operatorName={row.operatorName} className="max-w-[60%] flex-none" />
          )}
        </div>
        <div className={LIST_CARD_DETAIL_LINE_CLASS}>
          <ListStructureLine structure={row.structure} />
          {row.regionName === null ? null : <span className="max-w-[50%] flex-none truncate">{row.regionName}</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 text-[11px] leading-4">
            {row.bands.length > 0 ? <TechnologySummary bands={row.bands} className="mt-0 min-w-0 truncate whitespace-nowrap pl-0" /> : <EmptyValue />}
          </div>
          {variant === "admin" ? <StationRowActions row={row} placement="card" onWindowOpen={openers.openWindow} /> : null}
        </div>
      </div>
    </li>
  );
}

export function StationsListSkeletonCard({ variant }: { variant: StationsListVariant }) {
  return (
    <div className={cn(LIST_SKELETON_CARD_CLASS, STATIONS_CARD_HEIGHT_CLASSES[variant])}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
