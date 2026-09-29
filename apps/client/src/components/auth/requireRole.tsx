import { ArrowLeft01Icon, SecurityLockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { RequireAuth } from "./requireAuth";
import { MapLinkButton } from "@/components/app/errorScreens";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { authClient } from "@/lib/auth/client";

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

  if (!allowedRoles.includes(userRole))
    return (
      <PageErrorState
        tone="neutral"
        icon={SecurityLockIcon}
        title={t("errorPage.forbidden.title")}
        description={t("errorPage.forbidden.description")}
        signal="barred"
        action={
          <>
            <MapLinkButton />
            <Button variant="outline" onClick={() => router.history.back()}>
              <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("actions.back")}
            </Button>
          </>
        }
      />
    );

  return <>{children}</>;
}
