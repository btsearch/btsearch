import type { OfficialLocation, OfficialSite } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { MapMarker, MarkerContent } from "@/components/ui/map";
import { PopupBrandMark } from "@/features/map/components/popupParts";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";
import { toOfficialLabelComparator } from "@/features/official/labels";
import { officialBandLabelsQueryOptions } from "@/features/official/queries";
import { getOfficialSiteCode } from "@/features/official/sites";
import { listPermitBandTags } from "@/features/station-details/officialPermits";
import { cn } from "@/lib/utils";

type RegisterStationOverlayProps = {
  location: OfficialLocation;
  onSitePick: (site: OfficialSite) => void;
};

const TAG_CLASS = "px-1 py-px rounded-md bg-muted text-[8px] text-muted-foreground border border-border/50";
const COMPARE_LABELS_BY_NAME = toOfficialLabelComparator([]);

export function RegisterStationOverlay({ location, onSitePick }: RegisterStationOverlayProps) {
  const { t } = useTranslation(["submissions", "stationDetails"]);
  const { lookups } = useMapLookups();
  const { data: compareLabels = COMPARE_LABELS_BY_NAME } = useQuery({ ...officialBandLabelsQueryOptions(), select: toOfficialLabelComparator });
  const { sites = [], ...siteLocation } = location;

  return (
    <MapMarker longitude={location.longitude} latitude={location.latitude} anchor="bottom">
      <MarkerContent className="cursor-default">
        <div
          role="dialog"
          aria-label={t("locationPicker.selectStation")}
          className="w-72 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden text-sm"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/50">
            <h3 className="font-medium text-sm leading-tight pr-4">{location.city}</h3>
            {location.address ? <p className="text-[11px] text-muted-foreground">{location.address}</p> : null}
          </div>
          <div className="max-h-54 overflow-y-auto custom-scrollbar">
            {sites.map((site) => {
              const { operator, brand, color } = getOperatorLook(lookups, site.operatorId);
              const permits = site.permits ?? [];

              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onSitePick({ ...site, location: siteLocation })}
                  className="flex w-full gap-1.5 text-left px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-0"
                >
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center" aria-hidden="true">
                    <PopupBrandMark brand={brand} color={color} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs" style={{ color }}>
                        {operator?.name || t("main:unknownOperator")}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">{getOfficialSiteCode(site)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {listPermitBandTags(permits, compareLabels).map((band) => (
                        <span key={band} className={cn(TAG_CLASS, "font-semibold uppercase tracking-wider")}>
                          {band}
                        </span>
                      ))}
                      <span className={cn(TAG_CLASS, "font-mono font-medium")}>
                        {t("stationDetails:permits.permitsCount", { count: permits.length })}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">{t("locationPicker.selectStation")}</span>
          </div>
        </div>
      </MarkerContent>
    </MapMarker>
  );
}
