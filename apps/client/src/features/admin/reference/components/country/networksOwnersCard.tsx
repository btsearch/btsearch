import { ArrowRight01Icon, Building03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { structureOwnersQueryOptions } from "../../api/structureOwners";
import { ownerLocationCountQueryOptions } from "../../api/usage";
import type { Brand, Country, StructureOwner } from "../../types";
import { StructureOwnerDialog } from "../owners/structureOwnerDialog";
import { BrandTile } from "../shared/brandTile";
import { CardAddButton, CardLoadState, CountBadge } from "../shared/cardParts";
import { LOADING_VALUE, type Loadable, combineCountQueries } from "../shared/loadable";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, ReferenceIconTile } from "../shared/referenceCards";
import { EMPTY_VALUE, MONO_TEXT_CLASS } from "../shared/values";
import { NETWORKS_ROW_CLASS, NETWORKS_ROW_ITEM_CLASS, NETWORKS_ROW_LINK_CLASS, NetworksTileSkeleton } from "./networksCardParts";
import { Skeleton } from "@/components/ui/skeleton";
import { brandsQueryOptions } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

type OwnerEntry = {
  owner: StructureOwner;
  locationCount: Loadable<number>;
};

type NetworksOwnersCardProps = {
  country: Country;
  canEdit: boolean;
};

type OwnerListProps = {
  countryCode: string;
  owners: StructureOwner[];
  brands: Brand[] | undefined;
  isBrandListPending: boolean;
  canOpenOwnerList: boolean;
};

type OwnerTileProps = {
  owner: StructureOwner;
  brand?: Brand;
  isBrandListPending: boolean;
};

const OWNER_ROW_LIMIT = 8;
const SKELETON_ROW_COUNT = 3;
const UNKNOWN_COUNT_RANK = -1;
const ALL_OWNERS_LINK_CLASS = cn(
  "mt-auto flex items-center justify-between gap-3 border-t px-4 py-3.5 text-sm leading-5 font-medium text-primary sm:px-5",
  NETWORKS_ROW_LINK_CLASS,
);

function getCountRank(locationCount: Loadable<number>): number {
  return locationCount.state === "ready" ? locationCount.value : UNKNOWN_COUNT_RANK;
}

function rankByLocations(entries: readonly OwnerEntry[]): OwnerEntry[] {
  return [...entries].sort((left, right) => getCountRank(right.locationCount) - getCountRank(left.locationCount));
}

function OwnerTile({ owner, brand, isBrandListPending }: OwnerTileProps) {
  if (owner.brandId === null) return <ReferenceIconTile icon={Building03Icon} />;
  if (isBrandListPending) return <NetworksTileSkeleton />;
  return <BrandTile brand={brand} size={32} />;
}

function OwnerLocations({ locationCount }: { locationCount: Loadable<number> }) {
  const { t, i18n } = useTranslation("admin");

  if (locationCount.state === "loading") return <Skeleton aria-hidden="true" className="h-4 w-20 shrink-0" />;
  if (locationCount.state === "failed") return <span className="shrink-0 text-sm text-muted-foreground">{EMPTY_VALUE}</span>;

  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className={MONO_TEXT_CLASS}>{locationCount.value.toLocaleString(i18n.language)}</span>
      <span className="text-xs text-muted-foreground">{t("main:overlay.locations", { count: locationCount.value })}</span>
    </span>
  );
}

function OwnerList({ countryCode, owners, brands, isBrandListPending, canOpenOwnerList }: OwnerListProps) {
  const { t } = useTranslation("admin");
  const [rankedCountryCode, setRankedCountryCode] = useState<string | null>(null);
  const locationCounts = useQueries({
    queries: owners.map((owner) => ownerLocationCountQueryOptions(owner.id)),
    combine: combineCountQueries,
  });

  const hasEveryCount = locationCounts.every((locationCount) => locationCount.state !== "loading");
  if (hasEveryCount && rankedCountryCode !== countryCode) setRankedCountryCode(countryCode);

  const isRanked = hasEveryCount || rankedCountryCode === countryCode;
  const entries = owners.map((owner, index): OwnerEntry => ({ owner, locationCount: isRanked ? locationCounts[index] : LOADING_VALUE }));
  const orderedEntries = isRanked ? rankByLocations(entries) : entries;
  const shownEntries = canOpenOwnerList ? orderedEntries.slice(0, OWNER_ROW_LIMIT) : orderedEntries;
  const brandsById = new Map((brands ?? []).map((brand) => [brand.id, brand]));

  return (
    <>
      <ul className="border-t">
        {shownEntries.map(({ owner, locationCount }) => (
          <li key={owner.id} className={NETWORKS_ROW_ITEM_CLASS}>
            <div className={NETWORKS_ROW_CLASS}>
              <OwnerTile
                owner={owner}
                brand={owner.brandId === null ? undefined : brandsById.get(owner.brandId)}
                isBrandListPending={isBrandListPending}
              />
              <p className="min-w-0 flex-1 truncate text-sm leading-5 font-medium">{owner.name}</p>
              <OwnerLocations locationCount={locationCount} />
            </div>
          </li>
        ))}
      </ul>
      {canOpenOwnerList ? (
        <Link to="/admin/structure-owners" search={{ countries: countryCode }} className={ALL_OWNERS_LINK_CLASS}>
          {t("reference.country.networks.owners.all", { total: owners.length })}
          <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      ) : null}
    </>
  );
}

export function NetworksOwnersCard({ country, canEdit }: NetworksOwnersCardProps) {
  const { t, i18n } = useTranslation("admin");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { data: owners, isError, isFetching, refetch } = useQuery(structureOwnersQueryOptions());
  const { data: brands, isError: hasBrandsLoadFailed } = useQuery(brandsQueryOptions());

  const countryOwners = owners?.filter((owner) => owner.countryCode === country.code);
  const addLabel = t("reference.country.networks.owners.add");

  function openAddDialog() {
    setIsAddOpen(true);
  }

  let body: ReactNode;
  if (countryOwners === undefined) {
    body = (
      <CardLoadState
        hasLoadFailed={isError}
        errorTitle={t("reference.country.networks.owners.loadFailed")}
        isRetrying={isFetching}
        onRetry={() => void refetch()}
        skeletonRowCount={SKELETON_ROW_COUNT}
      />
    );
  } else if (countryOwners.length === 0) {
    body = (
      <CenteredCardState
        icon={Building03Icon}
        title={t("reference.country.networks.owners.empty.title")}
        description={
          canEdit ? t("reference.country.networks.owners.empty.description") : t("reference.country.networks.owners.empty.readOnlyDescription")
        }
        action={canEdit ? <CardAddButton variant="outline" label={addLabel} onClick={openAddDialog} /> : null}
      />
    );
  } else {
    body = (
      <OwnerList
        countryCode={country.code}
        owners={countryOwners}
        brands={brands}
        isBrandListPending={brands === undefined && !hasBrandsLoadFailed}
        canOpenOwnerList={canEdit}
      />
    );
  }

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("nav:items.structureOwners")}
        description={t("reference.country.networks.owners.description")}
        badge={countryOwners === undefined ? null : <CountBadge>{countryOwners.length.toLocaleString(i18n.language)}</CountBadge>}
        action={canEdit ? <CardAddButton label={addLabel} isCompactOnPhones onClick={openAddDialog} /> : null}
      />
      {body}
      {canEdit ? <StructureOwnerDialog open={isAddOpen} onOpenChange={setIsAddOpen} defaultCountryCode={country.code} /> : null}
    </ReferenceCard>
  );
}
