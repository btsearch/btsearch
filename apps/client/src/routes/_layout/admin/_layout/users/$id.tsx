import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();

  const { data: userData, isLoading } = useQuery({
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
      return result.data?.users?.[0] as unknown as AdminUser | undefined;
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

  if (isLoading) {
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
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">User not found</p>
          <Button variant="outline" onClick={() => navigate({ to: "/admin/users" })}>
            Back to Users
          </Button>
        </div>
      </div>
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
