import { ArrowLeft01Icon, Flag02Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlag, ObservedSite } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { joinParts } from "../model/format";
import { getKindLabel } from "../model/kinds";
import { BrandMark } from "@/components/cellular/brandMark";
import { buttonVariants } from "@/components/ui/button";
import { getEstimatedSiteName } from "@/features/map/crowd/sites/estimatedSites";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";
import { getObservedSiteMapHash } from "@/features/map/mapLinks";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatShortUtcDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type EvidenceHeaderProps = {
  site: ObservedSite;
  flagId: number | null;
  flag: ObservationFlag | undefined;
  groupNames: readonly string[];
  isAmbiguous: boolean;
};

type BackLinkProps = {
  flagId: number | null;
};

const CHIP_CLASS =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-lg bg-muted/40 px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const BADGE_CLASS = "inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-semibold";

export function EvidenceBackLink({ flagId }: BackLinkProps) {
  const { t } = useTranslation("nav");

  return (
    <Link
      to="/admin/observation-flags"
      search={flagId === null ? {} : { flag: flagId }}
      className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 shrink-0 gap-2 pr-3 pl-1" })}
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" className="size-4" />
      {t("items.observationFlags")}
    </Link>
  );
}

function readStatusKey(site: ObservedSite, isAmbiguous: boolean): string {
  if (isAmbiguous && site.status === "unmatched") return "ambiguous";
  return site.status;
}

export function EvidenceHeader({ site, flagId, flag, groupNames, isAmbiguous }: EvidenceHeaderProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { lookups } = useMapLookups();
  const { operator, brand, color } = getOperatorLook(lookups, site.operatorId);
  const region = site.regionId === null ? null : (lookups?.regionsById.get(site.regionId)?.name ?? null);
  const statusKey = readStatusKey(site, isAmbiguous);
  const groupText = groupNames.length === 0 ? null : t("observationFlags.places.group", { names: groupNames.join(", ") });

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="flex h-11 items-center justify-between gap-3 px-4 py-2">
        <EvidenceBackLink flagId={flagId} />
        {flagId === null ? null : (
          <Link to="/admin/observation-flags" search={{ flag: flagId }} className={cn(CHIP_CLASS, "min-w-0")}>
            <HugeiconsIcon icon={Flag02Icon} aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">
              {joinParts([t("observationFlags.evidence.flagChip", { id: flagId }), flag === undefined ? null : getKindLabel(flag.kind, t)])}
            </span>
          </Link>
        )}
      </div>
      <div
        className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5"
        style={{ backgroundImage: operator === null ? undefined : getOperatorHeaderTintGradient(color) }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {operator === null ? null : <BrandMark brand={brand} size={20} />}
            <h1 className="flex min-w-0 items-baseline gap-2">
              {operator === null ? null : <span className="text-base leading-5 font-semibold tracking-tight">{operator.name}</span>}
              <span className="text-sm leading-5 font-medium text-muted-foreground">{getEstimatedSiteName(site)}</span>
            </h1>
            <span className={cn(BADGE_CLASS, "text-muted-foreground")}>{t("observationFlags.estimated")}</span>
            <span
              className={cn(
                BADGE_CLASS,
                statusKey === "ambiguous" ? "border-amber-500/55 text-amber-700 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {t(`observationFlags.evidence.status.${statusKey}`)}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4 text-muted-foreground">
            {region === null && groupText === null ? null : (
              <span className="min-w-0 truncate">
                {region === null ? null : <span className="font-semibold text-foreground">{region}</span>}
                {region !== null && groupText !== null ? " · " : null}
                {groupText}
              </span>
            )}
            {site.firstSeenOn === null ? null : (
              <span className="shrink-0 text-[11px]">
                {t("observationFlags.evidence.seen", {
                  first: formatShortUtcDate(site.firstSeenOn, i18n.language),
                  last: formatShortUtcDate(site.lastSeenOn, i18n.language),
                })}
              </span>
            )}
          </div>
        </div>
        {site.latitude === null || site.longitude === null ? null : (
          <Link to="/" hash={getObservedSiteMapHash(site.id, { latitude: site.latitude, longitude: site.longitude })} className={CHIP_CLASS}>
            <HugeiconsIcon icon={MapsLocation01Icon} aria-hidden="true" className="size-3.5" />
            {t("common:actions.showOnMap")}
          </Link>
        )}
      </div>
    </header>
  );
}
