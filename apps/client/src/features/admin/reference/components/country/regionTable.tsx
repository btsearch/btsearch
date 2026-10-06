import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { regionLocationCountQueryOptions } from "../../api/usage";
import type { Region } from "../../types";
import { CardTable, CardTableCell, CardTableHead, CardTableRow } from "../shared/cardTable";
import { type Loadable, isZeroCount, toLoadable } from "../shared/loadable";
import { RowIconButton } from "../shared/referenceCards";
import { CountValue, EMPTY_VALUE, MONO_TEXT_CLASS } from "../shared/values";
import { type RegionListProps, getActiveStationCount } from "./regionList";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type RegionTableRowProps = {
  region: Region;
  activeStations: Loadable<number>;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

const SKELETON_ROW_COUNT = 4;

function RegionTableHead({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation("admin");

  return (
    <>
      <CardTableHead>{t("common:labels.name")}</CardTableHead>
      <CardTableHead className="w-30">{t("reference.country.regions.columns.code")}</CardTableHead>
      <CardTableHead className="w-35">{t("reference.country.regions.columns.isoCode")}</CardTableHead>
      <CardTableHead align="end" className="w-35">
        {t("reference.country.regions.columns.activeStations")}
      </CardTableHead>
      <CardTableHead align="end" className="w-35">
        {t("reference.country.regions.columns.locations")}
      </CardTableHead>
      {canEdit ? <CardTableHead className="w-19" /> : null}
    </>
  );
}

function RegionCount({ count }: { count: Loadable<number> }) {
  return (
    <span className={isZeroCount(count) ? "text-muted-foreground" : undefined}>
      <CountValue count={count} skeletonClassName="h-4 w-12" />
    </span>
  );
}

function RegionLocationCount({ regionId }: { regionId: number }) {
  const { data: count, isError } = useQuery(regionLocationCountQueryOptions(regionId));

  return <RegionCount count={toLoadable(count, isError)} />;
}

function RegionTableRow({ region, activeStations, canEdit, onEdit, onDelete }: RegionTableRowProps) {
  const { t } = useTranslation("admin");

  return (
    <CardTableRow>
      <CardTableCell className="font-medium">{region.name}</CardTableCell>
      <CardTableCell className={MONO_TEXT_CLASS}>{region.code}</CardTableCell>
      <CardTableCell className={cn(MONO_TEXT_CLASS, "text-muted-foreground")}>{region.isoCode ?? EMPTY_VALUE}</CardTableCell>
      <CardTableCell align="end" className={MONO_TEXT_CLASS}>
        <RegionCount count={activeStations} />
      </CardTableCell>
      <CardTableCell align="end" className={MONO_TEXT_CLASS}>
        <RegionLocationCount regionId={region.id} />
      </CardTableCell>
      {canEdit ? (
        <CardTableCell align="end">
          <div className="flex items-center justify-end gap-0.5">
            <RowIconButton label={t("reference.country.regions.editRegion", { name: region.name })} icon={PencilEdit02Icon} onClick={onEdit} />
            <RowIconButton
              label={t("reference.country.regions.deleteRegion", { name: region.name })}
              icon={Delete02Icon}
              destructive
              onClick={onDelete}
            />
          </div>
        </CardTableCell>
      ) : null}
    </CardTableRow>
  );
}

export function RegionTable({ regions, stationsByRegion, hasStationsLoadFailed, canEdit, onEdit, onDelete }: RegionListProps) {
  const { t } = useTranslation("admin");

  return (
    <CardTable aria-label={t("reference.country.regions.title")} head={<RegionTableHead canEdit={canEdit} />}>
      {regions.map((region) => (
        <RegionTableRow
          key={region.id}
          region={region}
          activeStations={getActiveStationCount(stationsByRegion, region.id, hasStationsLoadFailed)}
          canEdit={canEdit}
          onEdit={() => onEdit(region)}
          onDelete={() => onDelete(region)}
        />
      ))}
    </CardTable>
  );
}

export function RegionTableSkeleton({ canEdit }: { canEdit: boolean }) {
  return (
    <CardTable head={<RegionTableHead canEdit={canEdit} />}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <CardTableRow key={rowIndex} aria-hidden="true" className="hover:bg-transparent">
          <CardTableCell>
            <Skeleton className="h-4 w-36" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-9" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-12" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="ml-auto h-4 w-12" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="ml-auto h-4 w-12" />
          </CardTableCell>
          {canEdit ? <CardTableCell /> : null}
        </CardTableRow>
      ))}
    </CardTable>
  );
}
