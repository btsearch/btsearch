import { GlobalSearchIcon } from "@hugeicons/core-free-icons";
import { usePrefetchQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReferenceAccess } from "../../access/useReferenceAccess";
import { bandPlanQueryOptions } from "../../api/bandPlan";
import { countryQueryOptions } from "../../api/countries";
import { invalidateCountries, removeCountryQueries } from "../../api/queryKeys";
import { countryStatisticsQueryOptions, stationBreakdownQueryOptions } from "../../api/statistics";
import { structureOwnersQueryOptions } from "../../api/structureOwners";
import { teamGrantsQueryOptions } from "../../api/team";
import { ownerLocationCountQueryOptions, regionLocationCountQueryOptions } from "../../api/usage";
import { parseCountryCode } from "../../utils/countries";
import { BackToListButton, ReferenceDetailShell, ReferenceDetailSkeleton, ReferenceNotFound, useReturnToList } from "../shared/referenceDetailShell";
import { BandPlanSection } from "./bandPlanSection";
import { ClosingSection } from "./closingSection";
import { CountryHero } from "./countryHero";
import { COUNTRY_LIST_PATH, COUNTRY_SECTION_IDS } from "./countrySections";
import { GeneralSection } from "./generalSection";
import { NetworksSection } from "./networksSection";
import { PreparationCard } from "./preparationCard";
import { RegionsSection } from "./regionsSection";
import { TeamSection } from "./teamSection";
import { ForbiddenState } from "@/components/auth/requireRole";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { type PageSection, useRegisterPageSections } from "@/contexts/pageSections";
import { bandsQueryOptions, brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { useIsMobile } from "@/hooks/useMobile";

type CountryPageProps = {
  code: string;
};

type CountryShellProps = {
  notice?: ReactNode;
  children: ReactNode;
};

type CountryPreloadProps = {
  code: string;
  canEdit: boolean;
};

type CountryDetailProps = {
  code: string;
  isAccessPending: boolean;
  canEdit: boolean;
  canManageEditors: boolean;
};

function CountryShell({ notice, children }: CountryShellProps) {
  const { t } = useTranslation("nav");

  return (
    <ReferenceDetailShell backTo={COUNTRY_LIST_PATH} backLabel={t("nav:items.countries")} notice={notice}>
      {children}
    </ReferenceDetailShell>
  );
}

function CountryNotFound() {
  const { t } = useTranslation("admin");

  return (
    <ReferenceNotFound
      icon={GlobalSearchIcon}
      title={t("reference.country.states.notFound.title")}
      description={t("reference.country.states.notFound.description")}
      listPath={COUNTRY_LIST_PATH}
    />
  );
}

function RegionLocationCountPreload({ regionId }: { regionId: number }) {
  usePrefetchQuery(regionLocationCountQueryOptions(regionId));

  return null;
}

function OwnerLocationCountPreload({ ownerId }: { ownerId: number }) {
  usePrefetchQuery(ownerLocationCountQueryOptions(ownerId));

  return null;
}

function CountryEditPreload() {
  usePrefetchQuery(stationBreakdownQueryOptions("band"));

  return null;
}

function CountryPreload({ code, canEdit }: CountryPreloadProps) {
  const isMobile = useIsMobile();
  usePrefetchQuery(operatorsQueryOptions());
  usePrefetchQuery(brandsQueryOptions());
  usePrefetchQuery(bandsQueryOptions());
  usePrefetchQuery(bandPlanQueryOptions(code));
  usePrefetchQuery(countryStatisticsQueryOptions());
  usePrefetchQuery(stationBreakdownQueryOptions("region"));
  useQuery({ ...teamGrantsQueryOptions([code]), notifyOnChangeProps: [] });
  const { data: regions } = useQuery({ ...regionsQueryOptions(), notifyOnChangeProps: ["data"] });
  const { data: owners } = useQuery({ ...structureOwnersQueryOptions(), notifyOnChangeProps: ["data"] });

  const countedRegions = isMobile ? undefined : regions?.filter((region) => region.countryCode === code);
  const countedOwners = owners?.filter((owner) => owner.countryCode === code);

  return (
    <>
      {canEdit ? <CountryEditPreload /> : null}
      {countedRegions?.map((region) => (
        <RegionLocationCountPreload key={region.id} regionId={region.id} />
      ))}
      {countedOwners?.map((owner) => (
        <OwnerLocationCountPreload key={owner.id} ownerId={owner.id} />
      ))}
    </>
  );
}

function CountryPageSections({ hasHistory }: { hasHistory: boolean }) {
  const { t } = useTranslation("admin");
  const sections: PageSection[] = [
    { id: COUNTRY_SECTION_IDS.general, title: t("reference.country.general.title") },
    { id: COUNTRY_SECTION_IDS.regions, title: t("reference.country.regions.title") },
    { id: COUNTRY_SECTION_IDS.bandPlan, title: t("reference.country.bandPlan.title") },
    { id: COUNTRY_SECTION_IDS.networks, title: t("reference.country.networks.title") },
    { id: COUNTRY_SECTION_IDS.team, title: t("reference.country.team.title") },
  ];
  if (hasHistory) sections.push({ id: COUNTRY_SECTION_IDS.history, title: t("reference.country.closing.title") });
  useRegisterPageSections(sections);

  return null;
}

function CountryDetail({ code, isAccessPending, canEdit, canManageEditors }: CountryDetailProps) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const returnToList = useReturnToList(COUNTRY_LIST_PATH);
  const [mountedAt] = useState(Date.now);
  const [isRemoved, setIsRemoved] = useState(false);
  const {
    data: country,
    dataUpdatedAt,
    isFetching,
    isFetchedAfterMount,
    isRefetchError,
    refetch,
  } = useQuery({ ...countryQueryOptions(code), enabled: !isRemoved });

  const isCountryFresh = country !== undefined && dataUpdatedAt >= mountedAt;
  const isCountryPending = !isCountryFresh && !isFetchedAfterMount;
  const preload = <CountryPreload key="preload" code={code} canEdit={canEdit} />;

  function leaveRemovedCountry() {
    setIsRemoved(true);
    removeCountryQueries(queryClient, code);
    void invalidateCountries(queryClient);
    returnToList();
  }

  if (isRemoved || isAccessPending || isCountryPending) {
    return (
      <CountryShell>
        {isRemoved ? null : preload}
        <ReferenceDetailSkeleton />
      </CountryShell>
    );
  }

  if (!isCountryFresh) {
    return (
      <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={<BackToListButton to={COUNTRY_LIST_PATH} variant="outline" />} />
    );
  }

  if (country === null) return <CountryNotFound />;

  return (
    <CountryShell notice={isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null}>
      {preload}
      <div className="flex flex-col gap-10 sm:gap-12">
        <div className="flex flex-col gap-4">
          <CountryHero country={country} />
          {canEdit && !country.isVisible ? <PreparationCard country={country} /> : null}
        </div>
        <GeneralSection country={country} canEdit={canEdit} />
        <RegionsSection country={country} canEdit={canEdit} />
        <BandPlanSection country={country} canEdit={canEdit} />
        <NetworksSection country={country} canEdit={canEdit} />
        <TeamSection country={country} canManageEditors={canManageEditors} canManageMaintainers={canEdit} pageOpenedAt={mountedAt} />
        {canEdit ? <ClosingSection country={country} onRemoved={leaveRemovedCountry} /> : null}
      </div>
      <CountryPageSections key={`${i18n.language}:${String(canEdit)}`} hasHistory={canEdit} />
    </CountryShell>
  );
}

export function CountryPage({ code }: CountryPageProps) {
  const access = useReferenceAccess();
  const countryCode = parseCountryCode(code);

  if (access.hasLoadFailed) return <PageErrorState onRetry={access.retry} />;
  if (access.isPending && countryCode === null) {
    return (
      <CountryShell>
        <ReferenceDetailSkeleton />
      </CountryShell>
    );
  }
  if (!access.isPending && !access.canOpenCountry(countryCode ?? code)) return <ForbiddenState />;
  if (countryCode === null) return <CountryNotFound />;

  return (
    <CountryDetail
      key={countryCode}
      code={countryCode}
      isAccessPending={access.isPending}
      canEdit={access.isAdmin}
      canManageEditors={access.canManageEditors(countryCode)}
    />
  );
}
