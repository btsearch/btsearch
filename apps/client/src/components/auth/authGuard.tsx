import type { ReactNode } from "react";

import { AuthRequired } from "@/components/auth/authRequired";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: settings } = useSettings();
  const { data: session, isPending } = useSettledSession();

  const enforced = settings?.isSignInRequired === true;
  const authenticated = !!session?.user;

  if (enforced && !authenticated && !isPending) return <AuthRequired showMapLink={false} />;

  return <>{children}</>;
}
