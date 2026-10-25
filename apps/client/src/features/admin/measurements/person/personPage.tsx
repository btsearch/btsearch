import { ArrowLeft01Icon, ArrowUpRight01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { contributorQueryOptions } from "../api/contributors";
import { DevicesSection } from "./devicesSection";
import { PersonHero } from "./personHero";
import { PersonSkeleton } from "./personSkeleton";
import { TrustSection } from "./trustSection";
import { UploadsSection } from "./uploadsSection";
import { buttonVariants } from "@/components/ui/button";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { useNavMode } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

const CONTRIBUTOR_LIST_PATH = "/admin/measurements/contributors";
const TRAILING_SLASH = /\/$/;
const BACK_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1.5 text-muted-foreground");

function isContributorListPreviousEntry(): boolean {
  if (!("navigation" in window)) return false;
  const { currentEntry } = window.navigation;
  if (currentEntry === null || currentEntry.index < 1) return false;

  const previousUrl = window.navigation.entries().at(currentEntry.index - 1)?.url;
  if (!previousUrl) return false;
  return new URL(previousUrl).pathname.replace(TRAILING_SLASH, "") === CONTRIBUTOR_LIST_PATH;
}

function ContributorListLink({ className, children }: { className: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <Link
      to={CONTRIBUTOR_LIST_PATH}
      activeOptions={{ exact: true }}
      className={className}
      onClick={(event) => {
        const isModifiedClick = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (isModifiedClick || !isContributorListPreviousEntry()) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      {children}
    </Link>
  );
}

function BackButton({ variant }: { variant: "default" | "outline" }) {
  const { t } = useTranslation("admin");

  return (
    <ContributorListLink className={buttonVariants({ variant })}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("common:actions.back")}
    </ContributorListLink>
  );
}

function PersonPageShell({ notice, children }: { notice?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation("admin");
  const navMode = useNavMode();

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("w-full px-3 pt-5 sm:px-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ContributorListLink className={BACK_LINK_CLASS}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("measurements.tabs.contributors")}
          </ContributorListLink>
          {notice}
        </div>
        {children}
      </div>
    </div>
  );
}

export function PersonNotFound({ userId }: { userId?: string }) {
  const { t } = useTranslation("admin");

  return (
    <PageErrorState
      tone="neutral"
      icon={UserRemove01Icon}
      title={t("measurements.person.notFound.title")}
      description={t("measurements.person.notFound.description")}
      action={
        <>
          <BackButton variant="default" />
          {userId === undefined ? null : (
            <Link to="/admin/users/$id" params={{ id: userId }} className={buttonVariants({ variant: "outline" })}>
              <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("measurements.person.userAccount")}
            </Link>
          )}
        </>
      }
    />
  );
}

export function PersonPage({ userId }: { userId: string }) {
  const [mountedAt] = useState(Date.now);
  const { data: settings } = useSettings();
  const { data: contributor, dataUpdatedAt, isFetching, isFetchedAfterMount, isRefetchError, refetch } = useQuery(contributorQueryOptions(userId));

  const isContributorFresh = contributor !== undefined && dataUpdatedAt >= mountedAt;
  const isContributorPending = !isContributorFresh && !isFetchedAfterMount;

  if (isContributorPending) {
    return (
      <PersonPageShell>
        <PersonSkeleton />
      </PersonPageShell>
    );
  }

  if (!isContributorFresh) return <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={<BackButton variant="outline" />} />;

  if (contributor === null) return <PersonNotFound userId={userId} />;

  return (
    <PersonPageShell notice={isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null}>
      <div className="flex flex-col gap-10 sm:gap-12">
        <PersonHero contributor={contributor} currentTermsVersion={settings?.measurements?.termsVersion ?? null} />
        <TrustSection contributor={contributor} />
        <DevicesSection userId={userId} />
        <UploadsSection contributor={contributor} />
      </div>
    </PersonPageShell>
  );
}
