import { ArrowRight01Icon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservedCellRecord, ObservedSite, ObservedSiteNotPublicReason } from "@openbts/shared/contract";
import { calculateDistance, formatDistance } from "@openbts/shared/geo";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PopupCoordinatesFooter, PopupGuestMarks, PopupOperatorName, PopupRow, PopupShareButton, PopupStationId } from "../../components/popupParts";
import { TechnologySummary, TechnologySummarySkeleton } from "../../components/technologySummary";
import { type MapLookups, getOperatorLook } from "../../data/mapLookups";
import { listGuests } from "../../data/mapPoints";
import { getObservedSiteMapHash } from "../../mapLinks";
import { getObservedCellTechnologyBands } from "../../utils";
import { observedCellsQueryOptions } from "../api/observedQueries";
import { type MeasuredCoverageTarget, hideMeasuredCoverage, showMeasuredCoverage, useIsMeasuredCoverageShownFor } from "../coverage/coverageStore";
import { type EstimatedSiteEntry, type EstimatedSiteMarker, getEstimatedSiteName } from "./estimatedSites";
import { SitePlacementLine } from "./sitePlacementLine";
import { BrandMark } from "@/components/cellular/brandMark";
import { CloseButton } from "@/components/ui/close-button";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import { useIsMobile } from "@/hooks/useMobile";
import { APP_NAME } from "@/lib/api";
import { getOperatorTintGradient } from "@/lib/cellular/operators";
import { formatShortDate, formatShortUtcDate } from "@/lib/format";

type EstimatedSitePopupProps = {
  marker: EstimatedSiteMarker;
  lookups: MapLookups | undefined;
  isStaff: boolean;
  onClose: () => void;
  onOpenStation: (stationId: number) => void;
};

type SiteRowProps = {
  entry: EstimatedSiteEntry;
  cells: readonly ObservedCellRecord[] | null;
  lookups: MapLookups | undefined;
};

type StationLinkProps = {
  site: ObservedSite;
  stationId: number;
  isMatched: boolean;
  lookups: MapLookups | undefined;
  onOpenStation: (stationId: number) => void;
};

const NO_CELLS: ObservedCellRecord[] = [];
const HIDDEN_STAFF_REASONS: ReadonlySet<ObservedSiteNotPublicReason> = new Set(["ignored", "replaced"]);
const NOTE_CLASS = "px-3 pt-2 text-[11px] leading-4 text-muted-foreground";

function SiteRow({ entry, cells, lookups }: SiteRowProps) {
  const { t } = useTranslation("main");
  const { site } = entry;
  const look = getOperatorLook(lookups, site.operatorId);
  const guests = lookups === undefined ? [] : listGuests(site.guestOperatorIds, lookups);

  return (
    <PopupRow
      brand={look.brand}
      color={look.color}
      title={
        <>
          <PopupOperatorName name={look.operator?.name ?? t("unknownOperator")} />
          {guests.length > 0 ? <PopupGuestMarks guests={guests} /> : null}
          <PopupStationId id={getEstimatedSiteName(site)} />
        </>
      }
    >
      {cells === null ? (
        <TechnologySummarySkeleton />
      ) : (
        <TechnologySummary bands={getObservedCellTechnologyBands(cells, lookups?.bandsById)} className="pl-0" />
      )}
    </PopupRow>
  );
}

function StationLink({ site, stationId, isMatched, lookups, onOpenStation }: StationLinkProps) {
  const { t } = useTranslation("main");
  const { data: station, isError, isFetching, refetch } = useQuery(stationRecordQueryOptions(stationId));

  if (isError && station === undefined) return <InlineError size="sm" onRetry={() => void refetch()} isRetrying={isFetching} className="mx-1 mt-1" />;

  const look = getOperatorLook(lookups, station?.operatorId);
  const location = station?.location;
  const distance =
    location === null || location === undefined || site.latitude === null || site.longitude === null
      ? null
      : formatDistance(calculateDistance(site.latitude, site.longitude, location.latitude, location.longitude));
  let lead = isMatched ? t("crowd.popup.matchedHere") : t("crowd.popup.suggestedHere");
  if (distance !== null) lead = isMatched ? t("crowd.popup.matched", { distance }) : t("crowd.popup.suggested", { distance });

  return (
    <div className="border-t border-border/50 px-3 py-2">
      {station === undefined ? <Skeleton className="h-3 w-40" /> : <p className="text-[11px] leading-4 text-muted-foreground">{lead}</p>}
      <button
        type="button"
        onClick={() => onOpenStation(stationId)}
        className="mt-1.5 flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ backgroundImage: getOperatorTintGradient(look.color) }}
      >
        <BrandMark brand={{ color: look.color, logo: look.brand?.logo ?? null }} size={16} />
        <PopupOperatorName name={look.operator?.name ?? t("unknownOperator")} />
        <PopupStationId id={station?.siteId ?? station?.nodeName ?? ""} />
        <HugeiconsIcon icon={ArrowRight01Icon} className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  );
}

function VisibilityNote({ children }: { children: string }) {
  return (
    <p className="flex gap-1.5 px-3 pt-1.5 text-[11px] leading-4 text-foreground/80">
      <HugeiconsIcon icon={ViewOffIcon} className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function EstimatedSitePopupContent({ marker, lookups, isStaff, onClose, onOpenStation }: EstimatedSitePopupProps) {
  const { t, i18n } = useTranslation("main");
  const isMobile = useIsMobile();
  const [first] = marker.entries;
  const { site } = first;
  const siteIds = marker.entries.map((entry) => entry.site.id);
  const cellsQuery = useQuery(observedCellsQueryOptions({ kind: "sites", observedSiteIds: siteIds }));
  const cells = cellsQuery.data ?? (cellsQuery.isError ? NO_CELLS : null);
  const title = getEstimatedSiteName(site);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const coverageTarget: MeasuredCoverageTarget = {
    kind: "estimatedSite",
    observedSiteIds: siteIds,
    operatorId: site.operatorId,
    title,
    latitude: marker.latitude,
    longitude: marker.longitude,
  };
  const isCoverageShown = useIsMeasuredCoverageShownFor(coverageTarget);
  const isOwn = first.source === "mine" && !site.isPublic;
  const people = site.evidence?.people ?? 0;
  const lastSeen = formatShortUtcDate(site.lastSeenOn, language);
  const staffReasons = site.notPublicReasons.filter((reason) => !HIDDEN_STAFF_REASONS.has(reason));
  const linkedSite = marker.entries.find((entry) => entry.site.status === "matched" || entry.site.status === "suggested")?.site;
  const linkedStationId = linkedSite?.status === "matched" ? linkedSite.matchedStationId : (linkedSite?.suggestedStationId ?? null);
  const shareUrl = `${window.location.origin}/#${getObservedSiteMapHash(site.id, marker)}`;

  let peopleLine = t("crowd.popup.measuredBy", { people: t("crowd.popup.people", { count: people }), date: lastSeen });
  if (isOwn && people <= 1) peopleLine = t("crowd.popup.measuredByYou", { date: lastSeen });

  function changeCoverage(isOn: boolean) {
    if (!isOn) {
      hideMeasuredCoverage();
      return;
    }
    showMeasuredCoverage(coverageTarget);
    if (isMobile) onClose();
  }

  return (
    <div className="w-72 text-sm">
      <div className="flow-root border-b border-border/50 py-2 pr-1.5 pl-3">
        <div className="float-right -my-0.5 ml-2 flex items-center">
          <PopupShareButton url={shareUrl} title={title} label={t("crowd.popup.share")} />
          <CloseButton size="xs" onClick={onClose} />
        </div>
        <h3 className="overflow-x-clip text-sm leading-5 font-medium tabular-nums">
          {title}
          <Tooltip>
            <TooltipTrigger render={<span className="ml-1.5 cursor-help text-[11px] font-semibold whitespace-nowrap text-muted-foreground" />}>
              {t("crowd.estimated")}
            </TooltipTrigger>
            <TooltipContent>{t("crowd.estimatedHint", { appName: APP_NAME })}</TooltipContent>
          </Tooltip>
        </h3>
        <SitePlacementLine placement={site.placement} countryCode={site.countryCode} lookups={lookups} />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {marker.entries.map((entry) => (
          <SiteRow
            key={entry.site.id}
            entry={entry}
            cells={cells === null ? null : cells.filter((cell) => cell.observedSiteId === entry.site.id)}
            lookups={lookups}
          />
        ))}
        {cellsQuery.isError ? (
          <InlineError size="sm" onRetry={() => void cellsQuery.refetch()} isRetrying={cellsQuery.isFetching} className="m-1" />
        ) : null}
      </div>

      {linkedSite === undefined || linkedStationId === null ? null : (
        <StationLink
          site={linkedSite}
          stationId={linkedStationId}
          isMatched={linkedSite.status === "matched"}
          lookups={lookups}
          onOpenStation={onOpenStation}
        />
      )}

      <div className="border-t border-border/50">
        {site.evidence === null ? null : <p className={NOTE_CLASS}>{peopleLine}</p>}
        {site.ignore ? (
          <p className={NOTE_CLASS}>{t("crowd.popup.ignored", { reason: site.ignore.reason, date: formatShortDate(site.ignore.at, language) })}</p>
        ) : null}
        {isOwn ? <VisibilityNote>{t("crowd.popup.ownNote")}</VisibilityNote> : null}
        {!isOwn && isStaff && !site.isPublic ? (
          <VisibilityNote>
            {staffReasons.length > 0
              ? t("crowd.popup.staffNoteReasons", { reasons: staffReasons.map((reason) => t(`crowd.notPublicReasons.${reason}`)).join(", ") })
              : t("crowd.popup.staffNote")}
          </VisibilityNote>
        ) : null}
        <label className="flex h-8 cursor-pointer items-center justify-between gap-2 px-3 transition-colors hover:bg-muted/50">
          <span className="text-xs leading-4 font-medium">{t("crowd.coverage.title")}</span>
          <Switch size="sm" checked={isCoverageShown} onCheckedChange={changeCoverage} />
        </label>
      </div>

      <PopupCoordinatesFooter latitude={marker.latitude} longitude={marker.longitude} detail={t("crowd.popup.approximate")} />
    </div>
  );
}
