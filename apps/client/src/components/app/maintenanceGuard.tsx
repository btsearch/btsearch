import { useQuery } from "@tanstack/react-query";
import { useLocation, useRouter } from "@tanstack/react-router";
import { type ReactNode, Suspense, lazy, useEffect, useRef } from "react";

import { settingsQueryOptions } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { MAINTENANCE_CHECK_INTERVAL, isMaintenanceRecoveryRoute } from "@/lib/maintenance";

type MaintenanceGuardProps = { children: ReactNode };

const MaintenancePage = lazy(() => import("./maintenancePage").then((module) => ({ default: module.MaintenancePage })));

export function MaintenanceGuard({ children }: MaintenanceGuardProps): ReactNode {
  const { data: settings } = useQuery({
    ...settingsQueryOptions(),
    refetchInterval: MAINTENANCE_CHECK_INTERVAL,
    refetchOnWindowFocus: "always",
  });
  const { data: session, isPending } = useSettledSession();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const wasRestricted = useRef(false);
  const hasSettings = settings !== undefined;
  const isAdministrator = session?.user.role === "admin";
  const isRestricted = settings?.isMaintenanceMode === true && !isAdministrator;

  useEffect(() => {
    if (isPending || !hasSettings) return;

    const hasRecovered = wasRestricted.current && !isRestricted;
    wasRestricted.current = isRestricted;
    if (!hasRecovered) return;

    if (pathname === "/maintenance") void router.navigate({ to: isAdministrator ? "/admin/settings" : "/", replace: true });
    else void router.invalidate();
  }, [isRestricted, isPending, hasSettings, pathname, router, isAdministrator]);

  if (!isRestricted || pathname === "/maintenance" || isMaintenanceRecoveryRoute(pathname)) return children;
  if (isPending) return null;

  return (
    <Suspense fallback={null}>
      <MaintenancePage />
    </Suspense>
  );
}
