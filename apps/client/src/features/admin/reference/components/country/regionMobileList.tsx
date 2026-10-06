import { ArrowDown01Icon, Delete02Icon, MoreHorizontalIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Region } from "../../types";
import type { Loadable } from "../shared/loadable";
import { ReferenceMeta, ReferenceMetaItem } from "../shared/referenceCards";
import { EMPTY_VALUE } from "../shared/values";
import { type RegionListProps, getActiveStationCount } from "./regionList";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type RegionRowMenuProps = {
  regionName: string;
  onEdit: () => void;
  onDelete: () => void;
};

type RegionMobileRowProps = {
  region: Region;
  activeStations: Loadable<number>;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

const FIRST_ROW_COUNT = 6;
const SKELETON_ROW_COUNT = 3;
const REST_COLLAPSE_CLASS = "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none";
const SHOW_REST_BUTTON_CLASS = "h-12 w-full cursor-pointer rounded-none border-t-border text-primary hover:text-primary focus-visible:ring-inset";

function RegionRowMenu({ regionName, onEdit, onDelete }: RegionRowMenuProps) {
  const { t } = useTranslation("admin");
  const label = t("reference.country.regions.rowActions", { name: regionName });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="cursor-pointer text-muted-foreground" />}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
          <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" />
          {t("common:actions.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={onDelete}>
          <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RegionStationCount({ count }: { count: Loadable<number> }) {
  const { t, i18n } = useTranslation("admin");

  if (count.state === "loading") return <Skeleton aria-hidden="true" className="h-4 w-16 shrink-0" />;
  if (count.state === "failed") return <span className="shrink-0 text-xs leading-4 text-muted-foreground">{EMPTY_VALUE}</span>;

  const stations = count.value;

  return (
    <span className="shrink-0 text-xs leading-4 whitespace-nowrap text-muted-foreground">
      <span className={cn("tabular-nums", stations > 0 && "text-foreground")}>{stations.toLocaleString(i18n.language)}</span>{" "}
      {t("reference.country.regions.stations", { count: stations })}
    </span>
  );
}

function RegionMobileRow({ region, activeStations, canEdit, onEdit, onDelete }: RegionMobileRowProps) {
  return (
    <li className={cn("flex items-center gap-3 border-t py-2.5 pl-4", canEdit ? "pr-2" : "pr-4")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">{region.name}</p>
        <div className="font-mono text-xs leading-4 text-muted-foreground">
          <ReferenceMeta>
            <ReferenceMetaItem>{region.code}</ReferenceMetaItem>
            {region.isoCode === null ? null : <ReferenceMetaItem>{region.isoCode}</ReferenceMetaItem>}
          </ReferenceMeta>
        </div>
      </div>
      <RegionStationCount count={activeStations} />
      {canEdit ? <RegionRowMenu regionName={region.name} onEdit={onEdit} onDelete={onDelete} /> : null}
    </li>
  );
}

function RegionMobileRows({ regions, stationsByRegion, hasStationsLoadFailed, canEdit, onEdit, onDelete }: RegionListProps) {
  return (
    <>
      {regions.map((region) => (
        <RegionMobileRow
          key={region.id}
          region={region}
          activeStations={getActiveStationCount(stationsByRegion, region.id, hasStationsLoadFailed)}
          canEdit={canEdit}
          onEdit={() => onEdit(region)}
          onDelete={() => onDelete(region)}
        />
      ))}
    </>
  );
}

export function RegionMobileList({ regions, ...rowProps }: RegionListProps) {
  const { t } = useTranslation("admin");
  const restId = useId();
  const [isExpanded, setIsExpanded] = useState(false);

  const restRegions = regions.slice(FIRST_ROW_COUNT);

  return (
    <div>
      <ul>
        <RegionMobileRows regions={regions.slice(0, FIRST_ROW_COUNT)} {...rowProps} />
      </ul>
      {restRegions.length > 0 ? (
        <>
          <div id={restId} inert={!isExpanded} className={cn(REST_COLLAPSE_CLASS, isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
            <ul className="min-h-0 overflow-hidden">
              <RegionMobileRows regions={restRegions} {...rowProps} />
            </ul>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={isExpanded}
            aria-controls={restId}
            className={SHOW_REST_BUTTON_CLASS}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? t("common:actions.showLess") : t("reference.country.regions.showRest", { count: restRegions.length })}
            <span
              data-icon="inline-end"
              aria-hidden="true"
              className={cn("inline-flex transition-transform motion-reduce:transition-none", isExpanded && "rotate-180")}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} />
            </span>
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function RegionMobileListSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 border-t px-4 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
