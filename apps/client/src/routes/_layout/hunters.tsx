import { ArrowRight01Icon, Facebook01Icon, InstagramIcon, Mail01Icon, SearchRemoveIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Region } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequireAuth } from "@/components/auth/requireAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CountryFacet,
  type CountrySection,
  type HunterEntry,
  buildSections,
  countHuntersByCountry,
  countListedHunters,
  listHunterRegions,
  placeHunters,
} from "@/features/hunters/directory";
import { huntersQueryOptions } from "@/features/hunters/queries";
import { ClearFiltersButton, FacetCount, FacetPill, FilterSearchInput, FilterSearchShell, RegionCombobox } from "@/features/shared/filterPanel";
import { regionsQueryOptions } from "@/features/shared/lookups";
import { UserLink } from "@/features/user-profile/components/userLink";
import { resolveAvatarUrl } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

const VISIBLE_REGION_COUNT = 6;

function HuntersFilterBar({
  search,
  onSearchChange,
  facets,
  countryCodes,
  onToggleCountry,
  regions,
  regionIds,
  onRegionIdsChange,
  activeFilterCount,
  onClearFilters,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  facets: CountryFacet[];
  countryCodes: string[];
  onToggleCountry: (countryCode: string) => void;
  regions: Region[];
  regionIds: number[];
  onRegionIdsChange: (regionIds: number[]) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}) {
  const { t, i18n } = useTranslation("main");

  return (
    <div className="sticky top-0 z-20 -mx-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FilterSearchShell size="sm" hasValue={search !== ""} onClear={() => onSearchChange("")} className="min-w-0 sm:max-w-sm sm:flex-1">
            <FilterSearchInput
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("hunters.searchPlaceholder")}
              aria-label={t("hunters.searchPlaceholder")}
            />
          </FilterSearchShell>
          <div className="min-w-0 sm:w-72">
            <RegionCombobox regions={regions} selectedRegions={regionIds} onChange={onRegionIdsChange} placeholder={t("hunters.allRegions")} />
          </div>
          {activeFilterCount > 0 ? (
            <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="self-start sm:ml-auto sm:self-auto" />
          ) : null}
        </div>

        {facets.length > 1 ? (
          <div role="group" aria-label={t("hunters.countryFilter")} className="flex flex-wrap gap-1.5">
            {facets.map((facet) => {
              const isActive = countryCodes.includes(facet.countryCode);
              return (
                <FacetPill
                  key={facet.countryCode}
                  active={isActive}
                  onClick={() => onToggleCountry(facet.countryCode)}
                  className="cursor-pointer pl-1.5"
                >
                  <CountryCodeTile code={facet.countryCode} size="xs" tone={isActive ? "inverse" : "default"} />
                  {getCountryName(facet.countryCode, i18n.language)}
                  <FacetCount count={facet.count} isActive={isActive} />
                </FacetPill>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContactIconLink({ href, label, icon }: { href: string; label: string; icon: IconSvgElement }) {
  return (
    <a
      href={href}
      aria-label={label}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </a>
  );
}

function HunterRegionBadges({ regions }: { regions: Region[] }) {
  const { t } = useTranslation("main");
  const [isExpanded, setIsExpanded] = useState(false);
  const hiddenCount = regions.length - VISIBLE_REGION_COUNT;
  const visibleRegions = isExpanded ? regions : regions.slice(0, VISIBLE_REGION_COUNT);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleRegions.map((region) => (
        <Badge key={region.id} variant="secondary" className="max-w-full text-[0.7rem]">
          <span className="truncate">{region.name}</span>
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge
          variant="outline"
          render={<button type="button" />}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? t("hunters.showFewerRegions") : t("hunters.showAllRegions")}
          onClick={() => setIsExpanded((current) => !current)}
          className="cursor-pointer text-[0.7rem] hover:bg-muted"
        >
          {isExpanded ? t("hunters.showFewerRegions") : `+${hiddenCount}`}
        </Badge>
      ) : null}
    </div>
  );
}

function HunterCard({ entry }: { entry: HunterEntry }) {
  const { t } = useTranslation("main");
  const { hunter, regions, otherCountryCodes } = entry;
  const displayName = hunter.name ?? hunter.username ?? "";

  return (
    <article className="flex min-w-0 gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-[border-color,box-shadow,opacity,transform] duration-150 ease-out hover:border-primary/30 hover:shadow-sm motion-reduce:transition-none sm:items-center">
      <Avatar className="size-12">
        <AvatarImage src={resolveAvatarUrl(hunter.image)} />
        <AvatarFallback className="text-base font-semibold">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1.5">
        {hunter.username ? (
          <UserLink
            user={hunter}
            className="group/profile -mx-1 block w-fit max-w-full rounded-md px-1 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-popup-open:no-underline"
          >
            <span className="block truncate text-sm font-semibold leading-5 transition-colors group-hover/profile:text-primary">{displayName}</span>
            <span className="block truncate text-xs text-muted-foreground transition-colors group-hover/profile:text-primary">
              @{hunter.username}
            </span>
          </UserLink>
        ) : (
          <h3 className="truncate text-sm font-semibold leading-5">{displayName}</h3>
        )}

        <HunterRegionBadges regions={regions} />
        {otherCountryCodes.length > 0 ? (
          <p className="text-xs text-muted-foreground">{t("hunters.alsoIn", { codes: otherCountryCodes.join(", ") })}</p>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 self-start sm:self-center">
        {hunter.contact?.email ? <ContactIconLink href={`mailto:${hunter.contact.email}`} label={`Email ${displayName}`} icon={Mail01Icon} /> : null}
        {hunter.contact?.instagram ? (
          <ContactIconLink href={`https://instagram.com/${hunter.contact.instagram}`} label={`Instagram ${displayName}`} icon={InstagramIcon} />
        ) : null}
        {hunter.contact?.facebook ? <ContactIconLink href={hunter.contact.facebook} label={`Facebook ${displayName}`} icon={Facebook01Icon} /> : null}
      </div>
    </article>
  );
}

function HunterGrid({ entries }: { entries: HunterEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {entries.map((entry) => (
        <HunterCard key={entry.hunter.id} entry={entry} />
      ))}
    </div>
  );
}

function CountrySections({ sections }: { sections: CountrySection[] }) {
  const { t, i18n } = useTranslation("main");

  const [onlySection] = sections;
  if (sections.length === 1 && onlySection !== undefined) return <HunterGrid entries={onlySection.entries} />;

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => {
        const headingId = `hunters-${section.countryCode}`;
        return (
          <section key={section.countryCode} aria-labelledby={headingId}>
            <div className="mb-3 flex items-center gap-2.5">
              <CountryCodeTile code={section.countryCode} />
              <h2 id={headingId} className="text-base font-semibold">
                {getCountryName(section.countryCode, i18n.language)}
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">{t("hunters.count", { count: section.entries.length })}</span>
            </div>
            <HunterGrid entries={section.entries} />
          </section>
        );
      })}
    </div>
  );
}

function HuntersSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-xl border bg-card px-4 py-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex gap-1">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HuntersEmptyState() {
  const { t } = useTranslation("main");

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={UserGroupIcon} className="size-7" />
      </div>
      <h2 className="text-base font-semibold">{t("hunters.emptyTitle")}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("hunters.emptySubtitle")}</p>
      <Link to="/settings" search={{ tab: "profile" }} className={cn(buttonVariants({ size: "sm" }), "mt-5")}>
        {t("hunters.joinCta")}
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
      </Link>
    </div>
  );
}

function HuntersContent() {
  const { t } = useTranslation("main");
  const [search, setSearch] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [regionIds, setRegionIds] = useState<number[]>([]);
  const huntersQuery = useQuery(huntersQueryOptions());
  const regionsQuery = useQuery(regionsQueryOptions());
  const hunters = huntersQuery.data;
  const regions = regionsQuery.data;
  const isLoading = huntersQuery.isLoading || regionsQuery.isLoading;
  const hasFailed = (huntersQuery.isError && !hunters) || (regionsQuery.isError && !regions);
  const isRetrying = huntersQuery.isFetching || regionsQuery.isFetching;

  const placed = useMemo(() => placeHunters(hunters ?? [], new Map((regions ?? []).map((region) => [region.id, region]))), [hunters, regions]);
  const facets = useMemo(() => countHuntersByCountry(placed), [placed]);
  const regionOptions = useMemo(() => listHunterRegions(placed, facets, countryCodes), [placed, facets, countryCodes]);
  const sections = useMemo(
    () => buildSections(placed, facets, { search, countryCodes, regionIds }),
    [placed, facets, search, countryCodes, regionIds],
  );
  const activeFilterCount = countryCodes.length + regionIds.length + (search.trim() === "" ? 0 : 1);

  const toggleCountry = (countryCode: string) => {
    const next = countryCodes.includes(countryCode) ? countryCodes.filter((code) => code !== countryCode) : [...countryCodes, countryCode];
    const remainingRegionIds = new Set(listHunterRegions(placed, facets, next).map((region) => region.id));
    setCountryCodes(next);
    setRegionIds((current) => current.filter((regionId) => remainingRegionIds.has(regionId)));
  };

  const retry = () => {
    void huntersQuery.refetch();
    void regionsQuery.refetch();
  };

  const clearFilters = () => {
    setSearch("");
    setCountryCodes([]);
    setRegionIds([]);
  };

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="w-full px-6 py-6">
        <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.hunters")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("hunters.subtitle")}</p>
          </div>
          {hunters && regions ? (
            <p className="shrink-0 text-sm font-medium text-muted-foreground">{t("hunters.count", { count: countListedHunters(sections) })}</p>
          ) : null}
        </header>

        <HuntersFilterBar
          search={search}
          onSearchChange={setSearch}
          facets={facets}
          countryCodes={countryCodes}
          onToggleCountry={toggleCountry}
          regions={regionOptions}
          regionIds={regionIds}
          onRegionIdsChange={setRegionIds}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        />

        <div className="pt-5">
          {huntersQuery.isRefetchError ? (
            <StaleDataNotice className="mb-3" onRetry={() => huntersQuery.refetch()} isRetrying={huntersQuery.isFetching} />
          ) : null}
          {isLoading ? (
            <HuntersSkeleton />
          ) : hasFailed ? (
            <ErrorState title={t("hunters.errorTitle")} description={t("common:error.reloadOrTryLater")} onRetry={retry} isRetrying={isRetrying} />
          ) : facets.length === 0 ? (
            <HuntersEmptyState />
          ) : sections.length === 0 ? (
            <ErrorState
              tone="neutral"
              icon={SearchRemoveIcon}
              title={t("search.noResults")}
              description={t("search.noResultsHint")}
              action={<ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />}
            />
          ) : (
            <CountrySections sections={sections} />
          )}
        </div>
      </div>
    </main>
  );
}

function HuntersPage() {
  return (
    <RequireAuth>
      <HuntersContent />
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/hunters")({
  component: HuntersPage,
  staticData: {
    titleKey: "items.hunters",
    i18nNamespace: "nav",
  },
});
