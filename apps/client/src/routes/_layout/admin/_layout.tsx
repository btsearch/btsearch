import { Outlet, createFileRoute, useMatches } from "@tanstack/react-router";

import { RequireRole } from "@/components/auth/requireRole";
import type { RouteHandle } from "@/routes/_layout";

const DEFAULT_ADMIN_ROLES = ["admin"];

function AdminLayout() {
  const matches = useMatches();
  const currentRoute = [...matches].reverse().find((m) => (m.staticData as RouteHandle)?.allowedRoles);
  const allowedRoles = (currentRoute?.staticData as RouteHandle)?.allowedRoles ?? DEFAULT_ADMIN_ROLES;

  return (
    <RequireRole allowedRoles={allowedRoles}>
      <Outlet />
    </RequireRole>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout")({
  component: AdminLayout,
});
