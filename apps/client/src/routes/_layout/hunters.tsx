import { ArrowRight01Icon, Facebook01Icon, InstagramIcon, Mail01Icon, Radar01Icon, Search01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequireAuth } from "@/components/auth/requireAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { regionsQueryOptions } from "@/features/shared/queries";
import { API_BASE, fetchJson } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type ContactInfo = {
  instagram?: string;
  facebook?: string;
  email?: string;
};

type HunterUser = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  regions: number[];
  contactInfo: ContactInfo | null;
};

type SelectedRegion = "all" | number;

function useHunters() {
  return useQuery({
    queryKey: ["hunters"],
    queryFn: () => fetchJson<{ data: HunterUser[] }>(`${API_BASE}/hunters`).then((r) => r.data),
  });
}

function HuntersFilterBar({
  search,
  selectedRegion,
  regions,
  onSearchChange,
  onRegionChange,
}: {
  search: string;
  selectedRegion: SelectedRegion;
  regions: { id: number; name: string }[];
  onSearchChange: (value: string) => void;
  onRegionChange: (value: SelectedRegion) => void;
}) {
  const { t } = useTranslation("main");

  return (
    <div className="sticky top-0 z-20 -mx-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 sm:max-w-sm sm:flex-1">
            <span className="sr-only">{t("hunters.searchPlaceholder")}</span>
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("hunters.searchPlaceholder")}
              className="pl-8"
            />
          </label>
        </div>

        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            aria-pressed={selectedRegion === "all"}
            onClick={() => onRegionChange("all")}
            className={cn(
              "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selectedRegion === "all"
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {t("hunters.allRegions")}
          </button>
          {regions.map((region) => {
            const selected = selectedRegion === region.id;
            return (
              <button
                key={region.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onRegionChange(region.id)}
                className={cn(
                  "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                {region.name}
              </button>
            );
          })}
        </div>
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

function HunterCard({ hunter, regionMap }: { hunter: HunterUser; regionMap: Map<number, string> }) {
  const instagram = hunter.contactInfo?.instagram?.replace(/^@/, "");

  return (
    <article className="flex min-w-0 gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-[border-color,box-shadow,opacity,transform] duration-150 ease-out hover:border-primary/30 hover:shadow-sm motion-reduce:transition-none sm:items-center">
      <Avatar className="size-12">
        <AvatarImage src={resolveAvatarUrl(hunter.image)} />
        <AvatarFallback className="text-base font-semibold">{hunter.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1.5">
        {hunter.username ? (
          <div className="group/profile min-w-0">
            <Link
              to="/users/$username"
              params={{ username: hunter.username }}
              className="-mx-1 inline-block max-w-full rounded-md px-1 transition-colors group-hover/profile:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="block truncate text-sm font-semibold leading-5">{hunter.name}</span>
            </Link>
            <Link
              to="/users/$username"
              params={{ username: hunter.username }}
              className="-mx-1 block w-fit max-w-full rounded-md px-1 text-xs text-muted-foreground transition-colors group-hover/profile:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="block truncate">@{hunter.username}</span>
            </Link>
          </div>
        ) : (
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-5">{hunter.name}</h2>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {hunter.regions.length > 0 ? (
            hunter.regions.map((regionId) => (
              <Badge key={regionId} variant="secondary" className="max-w-full text-[0.7rem]">
                <span className="truncate">{regionMap.get(regionId) ?? `#${regionId}`}</span>
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[0.7rem]">
              <HugeiconsIcon icon={Radar01Icon} className="size-3" />-
            </Badge>
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 self-start sm:self-center">
        {hunter.contactInfo?.email ? (
          <ContactIconLink href={`mailto:${hunter.contactInfo.email}`} label={`Email ${hunter.name}`} icon={Mail01Icon} />
        ) : null}
        {instagram ? <ContactIconLink href={`https://instagram.com/${instagram}`} label={`Instagram ${hunter.name}`} icon={InstagramIcon} /> : null}
        {hunter.contactInfo?.facebook ? (
          <ContactIconLink href={hunter.contactInfo.facebook} label={`Facebook ${hunter.name}`} icon={Facebook01Icon} />
        ) : null}
      </div>
    </article>
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
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion>("all");
  const { data: hunters, isLoading: huntersLoading, isError, isFetching, isRefetchError, refetch } = useHunters();
  const { data: regions = [] } = useQuery(regionsQueryOptions());

  const regionMap = useMemo(() => new Map(regions.map((region) => [region.id, region.name])), [regions]);
  const filteredHunters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (hunters ?? [])
      .filter((hunter) => selectedRegion === "all" || hunter.regions.includes(selectedRegion))
      .filter((hunter) => {
        if (!normalizedSearch) return true;
        return hunter.name.toLowerCase().includes(normalizedSearch) || (hunter.username?.toLowerCase().includes(normalizedSearch) ?? false);
      });
  }, [hunters, search, selectedRegion]);

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="w-full px-6 py-6">
        <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.hunters")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("hunters.subtitle")}</p>
          </div>
          <p className="shrink-0 text-sm font-medium text-muted-foreground">{t("hunters.count", { count: filteredHunters.length })}</p>
        </header>

        <HuntersFilterBar
          search={search}
          selectedRegion={selectedRegion}
          regions={regions}
          onSearchChange={setSearch}
          onRegionChange={setSelectedRegion}
        />

        <div className="pt-5">
          {isRefetchError ? <StaleDataNotice className="mb-3" onRetry={() => refetch()} isRetrying={isFetching} /> : null}
          {huntersLoading ? (
            <HuntersSkeleton />
          ) : isError && !hunters ? (
            <ErrorState
              title={t("hunters.errorTitle")}
              description={t("common:error.reloadOrTryLater")}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : filteredHunters.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredHunters.map((hunter) => (
                <HunterCard key={hunter.id} hunter={hunter} regionMap={regionMap} />
              ))}
            </div>
          ) : (
            <HuntersEmptyState />
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
