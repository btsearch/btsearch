import type { ReactNode } from "react";

import { AuthDialog } from "@/components/auth/authDialog";
import { authClient } from "@/lib/auth/client";

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) return <AuthDialog open forced onOpenChange={() => {}} />;

  return <>{children}</>;
}
