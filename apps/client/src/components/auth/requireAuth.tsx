import type { ReactNode } from "react";

import { AuthRequired } from "@/components/auth/authRequired";
import { useSettledSession } from "@/hooks/useSettledSession";
import type { authClient } from "@/lib/auth/client";

type AuthenticatedSession = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;
type RequireAuthProps = { children: ReactNode; render?: never } | { children?: never; render: (session: AuthenticatedSession) => ReactNode };

export function RequireAuth(props: RequireAuthProps) {
  const { data: session, isPending } = useSettledSession();

  if (isPending) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) return <AuthRequired />;

  return <>{props.render ? props.render(session) : props.children}</>;
}
