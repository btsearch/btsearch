import type { ReactNode } from "react";

import { AuthDialog } from "@/components/auth/authDialog";
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

  if (enforced && !authenticated && !isPending) return <AuthDialog open forced onOpenChange={() => {}} />;

  return <>{children}</>;
}
