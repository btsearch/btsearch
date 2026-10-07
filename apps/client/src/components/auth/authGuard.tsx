import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthRequired } from "@/components/auth/authRequired";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { isMaintenanceRecoveryRoute } from "@/lib/maintenance";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: settings } = useSettings();
  const { data: session, isPending } = useSettledSession();
  const pathname = useLocation({ select: (location) => location.pathname });

  const enforced = settings?.isSignInRequired === true;
  const authenticated = !!session?.user;

  const isMaintenanceRecovery = settings?.isMaintenanceMode === true && isMaintenanceRecoveryRoute(pathname);
  if (enforced && !authenticated && !isPending && !isMaintenanceRecovery) return <AuthRequired showMapLink={false} />;

  return <>{children}</>;
}
