import { SecurityLockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

import { RequireAuth } from "./requireAuth";

interface RequireRoleProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export function RequireRole({ children, allowedRoles = ["admin"] }: RequireRoleProps) {
  const { data: session, isPending } = authClient.useSession();
  const { t } = useTranslation("common");
  const router = useRouter();

  if (isPending) return null;

  if (!session?.user) return <RequireAuth>{children}</RequireAuth>;

  const userRole = session.user.role || "user";

  if (!allowedRoles.includes(userRole)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center p-8">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon icon={SecurityLockIcon} className="size-8 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{t("forbidden.title")}</p>
          <p className="text-sm text-muted-foreground">{t("forbidden.description")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.history.back()}>
          {t("actions.back")}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
