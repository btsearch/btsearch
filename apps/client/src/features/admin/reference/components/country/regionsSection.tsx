import { Location01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { stationBreakdownQueryOptions } from "../../api/statistics";
import type { Country, Region } from "../../types";
import { indexBreakdown } from "../../utils/bands";
import { CardAddButton, CountBadge } from "../shared/cardParts";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, ReferenceCardNote, ReferenceRowError } from "../shared/referenceCards";
import { ReferenceSection } from "../shared/referenceSection";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { RegionDeleteDialog } from "./regionDeleteDialog";
import { RegionDialog } from "./regionDialog";
import type { RegionListProps } from "./regionList";
import { RegionMobileList, RegionMobileListSkeleton } from "./regionMobileList";
import { RegionTable, RegionTableSkeleton } from "./regionTable";
import { regionsQueryOptions } from "@/features/shared/lookups";
import { useIsMobile } from "@/hooks/useMobile";

type RegionsSectionProps = {
  country: Country;
  canEdit: boolean;
};

type RegionsCardBodyProps = Omit<RegionListProps, "regions"> & {
  regions: Region[] | undefined;
  isMobile: boolean;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onAdd: () => void;
};

function RegionsCardBody({ regions, isMobile, hasLoadFailed, isRetrying, onRetry, onAdd, ...listProps }: RegionsCardBodyProps) {
  const { t } = useTranslation("admin");

  if (regions === undefined) {
    if (hasLoadFailed) {
      return (
        <div className="border-t">
          <ReferenceRowError title={t("reference.country.regions.loadFailed")} onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      );
    }
    return isMobile ? <RegionMobileListSkeleton /> : <RegionTableSkeleton canEdit={listProps.canEdit} />;
  }
  if (regions.length === 0) {
    return (
      <CenteredCardState
        icon={Location01Icon}
        title={t("reference.country.regions.empty.title")}
        description={listProps.canEdit ? t("reference.country.regions.empty.description") : t("reference.country.regions.empty.readOnlyDescription")}
        action={listProps.canEdit ? <CardAddButton variant="outline" label={t("reference.country.regions.add")} onClick={onAdd} /> : undefined}
      />
    );
  }

  return isMobile ? <RegionMobileList regions={regions} {...listProps} /> : <RegionTable regions={regions} {...listProps} />;
}

export function RegionsSection({ country, canEdit }: RegionsSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const isMobile = useIsMobile();
  const [dialogRegion, setDialogRegion] = useState<Region | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [regionToDelete, setRegionToDelete] = useState<Region | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { data: allRegions, isError: hasRegionsLoadFailed, isFetching: isFetchingRegions, refetch: refetchRegions } = useQuery(regionsQueryOptions());
  const { data: breakdownRows, isError: hasBreakdownLoadFailed } = useQuery(stationBreakdownQueryOptions("region"));

  const regions = allRegions
    ?.filter((region) => region.countryCode === country.code)
    .sort((left, right) => left.name.localeCompare(right.name, i18n.language));
  const stationsByRegion = breakdownRows === undefined ? undefined : indexBreakdown(breakdownRows, "regionId", country.code);

  function openAddDialog() {
    setDialogRegion(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(region: Region) {
    setDialogRegion(region);
    setIsDialogOpen(true);
  }

  function openDeleteDialog(region: Region) {
    setRegionToDelete(region);
    setIsDeleteOpen(true);
  }

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.regions} title={t("reference.country.regions.title")}>
      <ReferenceCard>
        <ReferenceCardHeader
          title={t("reference.country.regions.title")}
          description={isMobile ? undefined : t("reference.country.regions.description")}
          badge={regions === undefined ? undefined : <CountBadge>{regions.length.toLocaleString(i18n.language)}</CountBadge>}
          action={canEdit ? <CardAddButton label={t("reference.country.regions.add")} isCompactOnPhones onClick={openAddDialog} /> : null}
        />
        <RegionsCardBody
          regions={regions}
          stationsByRegion={stationsByRegion}
          hasStationsLoadFailed={hasBreakdownLoadFailed}
          canEdit={canEdit}
          isMobile={isMobile}
          hasLoadFailed={hasRegionsLoadFailed}
          isRetrying={isFetchingRegions}
          onRetry={() => void refetchRegions()}
          onAdd={openAddDialog}
          onEdit={openEditDialog}
          onDelete={openDeleteDialog}
        />
        <ReferenceCardNote>{t("reference.country.regions.outlineNote")}</ReferenceCardNote>
      </ReferenceCard>
      {canEdit ? (
        <>
          <RegionDialog country={country} region={dialogRegion} open={isDialogOpen} onOpenChange={setIsDialogOpen} />
          {regionToDelete === null ? null : <RegionDeleteDialog region={regionToDelete} open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />}
        </>
      ) : null}
    </ReferenceSection>
  );
}
