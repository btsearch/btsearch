import { ArrowLeft01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DangerZoneCard } from "@/features/admin/users/components/DangerZoneCard";
import { ManageUserCard } from "@/features/admin/users/components/ManageUserCard";
import { SessionsCard } from "@/features/admin/users/components/SessionsCard";
import { UserDetailHeader } from "@/features/admin/users/components/UserDetailHeader";
import { UserInfoCard } from "@/features/admin/users/components/UserInfoCard";
import type { AdminUser, Session } from "@/features/admin/users/types";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

function AdminUserDetailPage() {
  const { id: userId } = Route.useParams();
  const { t } = useTranslation("admin");

  const {
    data: userData,
    error,
    isLoading,
    isPaused,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: async () => {
      const result = await authClient.admin.listUsers({
        query: {
          filterField: "id",
          filterValue: userId,
          filterOperator: "eq",
          limit: 1,
        },
      });
      if (result.error) throw result.error;
      return (result.data?.users?.[0] as unknown as AdminUser | undefined) ?? null;
    },
    enabled: !!userId,
  });

  const { data: hasPassword } = useQuery({
    queryKey: ["admin", "user-has-password", userId],
    queryFn: async () => {
      const res = await fetchJson<{ data: { hasPassword: boolean } }>(`${API_BASE}/account/password?userId=${userId}`);
      return res.data.hasPassword;
    },
    enabled: !!userId,
  });

  const { data: sessions } = useQuery({
    queryKey: ["admin", "user-sessions", userId],
    queryFn: async () => {
      const result = await authClient.admin.listUserSessions({ userId });
      if (result.error) throw result.error;
      return (result.data as unknown as { sessions: Session[] }).sessions;
    },
    enabled: !!userId,
  });

  if (!userId) return <Navigate to="/admin/users" replace />;

  if (isLoading || (isPaused && !userData)) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!userData) {
    const backButton = (
      <Button variant={error ? "outline" : "default"} nativeButton={false} render={<Link to="/admin/users" />}>
        <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
        {t("common:actions.back")}
      </Button>
    );

    return error ? (
      <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={backButton} />
    ) : (
      <PageErrorState
        tone="neutral"
        icon={UserRemove01Icon}
        title={t("users.notFoundTitle")}
        description={t("users.notFoundDescription")}
        action={backButton}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        <UserDetailHeader user={userData} />
        <UserInfoCard user={userData} />
        <ManageUserCard user={userData} hasPassword={hasPassword} />
        <SessionsCard userId={userId} sessions={sessions ?? []} />
        <DangerZoneCard user={userData} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/users/$id")({
  component: AdminUserDetailPage,
  staticData: {
    titleKey: "breadcrumbs.userDetail",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "breadcrumbs.admin", path: "/admin/users", i18nNamespace: "admin" },
      { titleKey: "breadcrumbs.users", path: "/admin/users", i18nNamespace: "admin" },
    ],
  },
});
