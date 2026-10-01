import { UserRemove01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { MapLinkButton } from "@/components/app/errorScreens";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { regionsQueryOptions } from "@/features/shared/queries";
import { ProfileComments } from "@/features/user-profile/components/profileComments";
import { ProfileHero } from "@/features/user-profile/components/profileHero";
import { PROFILE_GRID_CLASS, ProfileAbout, ProfileContact, ProfileHunter } from "@/features/user-profile/components/profileSections";
import { EmptyProfile, PrivateProfileNotice, ProfileSkeleton } from "@/features/user-profile/components/profileStates";
import { type UserProfile, userProfileQueryOptions } from "@/features/user-profile/queries";
import { useNavMode } from "@/hooks/usePreferences";
import { useSettledSession } from "@/hooks/useSettledSession";
import { ApiResponseError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

function ProfileShell({ children }: { children: ReactNode }) {
  const navMode = useNavMode();

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("w-full px-3 pt-5 sm:px-6 sm:pt-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>{children}</div>
    </div>
  );
}

function ProfileBody({ profile, isOwner }: { profile: UserProfile; isOwner: boolean }) {
  const { user, contact, contactHidden, hunter, comments } = profile;
  const hasContent = Boolean(user.bio) || contactHidden || contact !== null || hunter !== null || (comments?.totalCount ?? 0) > 0;
  if (!hasContent && !isOwner) return <EmptyProfile />;

  const sections = (
    <>
      <ProfileAbout bio={user.bio} isOwner={isOwner} />
      <ProfileContact contact={contact} contactHidden={contactHidden} isOwner={isOwner} />
      {hunter ? <ProfileHunter regionIds={hunter.regions} /> : null}
    </>
  );

  if (comments === null) return <div className="grid items-start gap-8 @4xl:grid-cols-2 @4xl:gap-x-6">{sections}</div>;

  return (
    <div className={PROFILE_GRID_CLASS}>
      <div className="flex min-w-0 flex-col gap-8">{sections}</div>
      <ProfileComments comments={comments.items} totalCount={comments.totalCount} />
    </div>
  );
}

function UserProfilePage() {
  const { username } = Route.useParams();
  const { t } = useTranslation("main");
  const { data: session, isPending: isSessionPending } = useSettledSession();
  const { data: profile, error, isPending, isFetching, isRefetchError, refetch } = useQuery(userProfileQueryOptions(username));

  if (isPending || isSessionPending)
    return (
      <ProfileShell>
        <ProfileSkeleton />
      </ProfileShell>
    );

  if (profile === undefined) {
    if (error instanceof ApiResponseError && error.status === 404)
      return (
        <PageErrorState
          tone="neutral"
          icon={UserRemove01Icon}
          title={t("common:error.userNotFound")}
          description={t("common:error.userNotFoundDescription")}
          action={<MapLinkButton />}
        />
      );
    return <PageErrorState onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  const isOwner = session?.user.id === profile.user.id;

  return (
    <ProfileShell>
      {isRefetchError ? <StaleDataNotice className="mb-4" onRetry={() => void refetch()} isRetrying={isFetching} /> : null}
      <div key={profile.user.id} className="flex flex-col gap-8">
        <ProfileHero profile={profile} isOwner={isOwner} />
        {profile.restricted ? <PrivateProfileNotice /> : <ProfileBody profile={profile} isOwner={isOwner} />}
      </div>
    </ProfileShell>
  );
}

export const Route = createFileRoute("/_layout/users/$username")({
  component: UserProfilePage,
  loader: ({ params }) => {
    void queryClient.prefetchQuery(userProfileQueryOptions(params.username));
    void queryClient.prefetchQuery(regionsQueryOptions());
  },
  staticData: {
    titleKey: "userProfile.breadcrumb",
    i18nNamespace: "main",
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});
