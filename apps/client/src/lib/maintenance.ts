import { redirect } from "@tanstack/react-router";

import { settingsQueryOptions } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import { queryClient } from "@/lib/queryClient";

export const MAINTENANCE_CHECK_INTERVAL = 30_000;

export function isMaintenanceRecoveryRoute(pathname: string): boolean {
  return pathname === "/account/reset-password" || pathname === "/account/sign-out";
}

export async function checkMaintenanceAccess(pathname: string): Promise<void> {
  if (pathname === "/maintenance" || isMaintenanceRecoveryRoute(pathname)) return;

  const options = settingsQueryOptions();
  const settings = await queryClient
    .fetchQuery({ ...options, staleTime: MAINTENANCE_CHECK_INTERVAL, retry: false })
    .catch(() => queryClient.getQueryData(options.queryKey));
  if (!settings?.isMaintenanceMode) return;

  const { data: session } = await authClient.getSession();
  if (session?.user.role !== "admin") throw redirect({ to: "/maintenance", replace: true });
}
