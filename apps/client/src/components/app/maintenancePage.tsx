import { Login01Icon, Settings02Icon, ToolsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AuthDialog } from "@/components/auth/authDialog";
import { Button } from "@/components/ui/button";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { PageContentContext } from "@/contexts/pageContent";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";

export function MaintenancePage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { data: session } = useSettledSession();
  const { refetch, isFetching, isRefetchError } = useSettings();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const isAdministrator = session?.user.role === "admin";

  async function checkAvailability() {
    const result = await refetch();
    if (result.isError || result.data?.isMaintenanceMode) return;

    if (pathname === "/maintenance") await router.navigate({ to: "/", replace: true });
    else await router.invalidate();
  }

  return (
    <>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex shrink-0 justify-center px-6 pt-8">
          <img src="/btsearch.webp" alt="BTSearch" width={185} height={65} className="h-10 w-auto object-contain dark:invert" />
        </header>
        <PageContentContext.Provider value>
          <PageErrorState
            tone="neutral"
            icon={ToolsIcon}
            signal="noService"
            title={t("errorPage.maintenance.title")}
            description={t("errorPage.maintenance.description")}
            onRetry={checkAvailability}
            isRetrying={isFetching}
            retryLabel={t("errorPage.maintenance.retry")}
            action={
              isAdministrator ? (
                <Button variant="outline" nativeButton={false} render={<Link to="/admin/settings" />}>
                  <HugeiconsIcon icon={Settings02Icon} data-icon="inline-start" aria-hidden="true" />
                  {t("errorPage.maintenance.settings")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(true)}>
                  <HugeiconsIcon icon={Login01Icon} data-icon="inline-start" aria-hidden="true" />
                  {t("errorPage.maintenance.signIn")}
                </Button>
              )
            }
          >
            {isRefetchError ? <StaleDataNotice className="mt-4" /> : null}
          </PageErrorState>
        </PageContentContext.Provider>
      </div>
      {isDialogOpen ? <AuthDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} /> : null}
    </>
  );
}
