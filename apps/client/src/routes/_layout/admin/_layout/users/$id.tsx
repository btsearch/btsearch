import { ArrowLeft01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePrefetchQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { hasPasswordQueryOptions } from "@/features/admin/users/api/account";
import { accountHistoryQueryOptions, userActivityQueryOptions } from "@/features/admin/users/api/activity";
import { adminUserQueryOptions, userSessionsQueryOptions } from "@/features/admin/users/api/authAdmin";
import { discardRemovedUserQueries } from "@/features/admin/users/api/queryKeys";
import { AccountSection } from "@/features/admin/users/components/detail/accountSection";
import { ActivitySection } from "@/features/admin/users/components/detail/activitySection";
import { BanNotice } from "@/features/admin/users/components/detail/banNotice";
import { ModerationSection } from "@/features/admin/users/components/detail/moderationSection";
import { OwnAccountNotice } from "@/features/admin/users/components/detail/ownAccountNotice";
import { RolesSection } from "@/features/admin/users/components/detail/rolesSection";
import { SecuritySection } from "@/features/admin/users/components/detail/securitySection";
import { UserDetailSkeleton } from "@/features/admin/users/components/detail/userDetailSkeleton";
import { UserHero } from "@/features/admin/users/components/detail/userHero";
import { parseUserId } from "@/features/admin/users/utils/userId";
import { useNavMode } from "@/hooks/usePreferences";
import { useSettledSession } from "@/hooks/useSettledSession";
import { cn } from "@/lib/utils";

const USER_LIST_PATH = "/admin/users";
const TRAILING_SLASH = /\/$/;
const BACK_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1.5 text-muted-foreground");

function isUserListPreviousEntry(): boolean {
  if (!("navigation" in window)) return false;
  const { currentEntry } = window.navigation;
  if (currentEntry === null || currentEntry.index < 1) return false;

  const previousUrl = window.navigation.entries().at(currentEntry.index - 1)?.url;
  if (!previousUrl) return false;
  return new URL(previousUrl).pathname.replace(TRAILING_SLASH, "") === USER_LIST_PATH;
}

function UserListLink({ className, children }: { className: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <Link
      to={USER_LIST_PATH}
      activeOptions={{ exact: true }}
      className={className}
      onClick={(event) => {
        const isModifiedClick = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (isModifiedClick || !isUserListPreviousEntry()) return;
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
    <UserListLink className={buttonVariants({ variant })}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("common:actions.back")}
    </UserListLink>
  );
}

function UserPageShell({ notice, children }: { notice?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation("admin");
  const navMode = useNavMode();

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("w-full px-3 pt-5 sm:px-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <UserListLink className={BACK_LINK_CLASS}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("nav:items.users")}
          </UserListLink>
          {notice}
        </div>
        {children}
      </div>
    </div>
  );
}

function UserNotFound() {
  const { t } = useTranslation("common");

  return (
    <PageErrorState
      tone="neutral"
      icon={UserRemove01Icon}
      title={t("common:error.userNotFound")}
      description={t("common:error.userNotFoundDescription")}
      action={<BackButton variant="default" />}
    />
  );
}

function UserDetailPreload({ userId }: { userId: string }) {
  usePrefetchQuery(userSessionsQueryOptions(userId));
  usePrefetchQuery(hasPasswordQueryOptions(userId));
  usePrefetchQuery(userActivityQueryOptions(userId));
  usePrefetchQuery(accountHistoryQueryOptions(userId));

  return null;
}

function UserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSettledSession();
  const [mountedAt] = useState(Date.now);
  const [isRemoved, setIsRemoved] = useState(false);
  const {
    data: user,
    dataUpdatedAt,
    isFetching,
    isFetchedAfterMount,
    isRefetchError,
    refetch,
  } = useQuery({ ...adminUserQueryOptions(userId), enabled: !isRemoved });

  const isUserFresh = user !== undefined && dataUpdatedAt >= mountedAt;
  const isUserPending = !isUserFresh && !isFetchedAfterMount;

  function leaveRemovedUser() {
    setIsRemoved(true);
    void discardRemovedUserQueries(queryClient, userId);
    if (isUserListPreviousEntry()) router.history.back();
    else void router.navigate({ to: USER_LIST_PATH, replace: true });
  }

  if (isRemoved || isUserPending) {
    return (
      <UserPageShell>
        {isRemoved ? null : <UserDetailPreload userId={userId} />}
        <UserDetailSkeleton />
      </UserPageShell>
    );
  }

  if (!isUserFresh) return <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={<BackButton variant="outline" />} />;

  if (user === null) return <UserNotFound />;

  const isSelf = session?.user.id === user.id;

  return (
    <UserPageShell notice={isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null}>
      <div className="flex flex-col gap-10 sm:gap-12">
        <div className="flex flex-col gap-4">
          <UserHero user={user} isSelf={isSelf} />
          {user.isBanned ? <BanNotice user={user} /> : null}
          {isSelf ? <OwnAccountNotice /> : null}
        </div>
        <AccountSection user={user} />
        <RolesSection user={user} isSelf={isSelf} />
        <SecuritySection user={user} isSelf={isSelf} />
        <ActivitySection user={user} />
        {isSelf ? null : <ModerationSection user={user} onRemoved={leaveRemovedUser} />}
      </div>
    </UserPageShell>
  );
}

function AdminUserDetailPage() {
  const { id } = Route.useParams();
  const userId = parseUserId(id);

  if (userId === undefined) return <UserNotFound />;
  return <UserDetail key={userId} userId={userId} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/users/$id")({
  component: AdminUserDetailPage,
  staticData: {
    titleKey: "breadcrumbs.userDetail",
    i18nNamespace: "admin",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.admin", path: "/admin/users", i18nNamespace: "nav" },
      { titleKey: "items.users", path: "/admin/users", i18nNamespace: "nav" },
    ],
  },
});
