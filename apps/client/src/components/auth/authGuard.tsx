import type { ReactNode } from "react";

import { AuthRequired } from "@/components/auth/authRequired";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: settings } = useSettings();
  const { data: session, isPending } = authClient.useSession();

  const enforced = settings?.enforceAuthForAllRoutes === true;
  const authenticated = !!session?.user;

  if (enforced && !authenticated && !isPending) return <AuthRequired showMapLink={false} />;

  return <>{children}</>;
}
