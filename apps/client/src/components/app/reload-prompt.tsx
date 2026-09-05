import { ArrowReloadHorizontalIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";

export function ReloadPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh: () => setNeedRefresh(true),
  });

  const checkForUpdate = useCallback(() => {
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
  }, []);

  useEffect(() => {
    const handleVisibility = () => document.visibilityState === "visible" && checkForUpdate();
    const handleOnline = () => checkForUpdate();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [checkForUpdate]);

  useEffect(() => router.subscribe("onResolved", checkForUpdate), [router, checkForUpdate]);

  if (!needRefresh) return null;

  return (
    <div className="sticky bottom-4 ml-auto mr-4 z-50 max-w-sm rounded-xl border border-border bg-popover p-4 shadow-lg animate-in slide-in-from-bottom-4 fade-in">
      <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" onClick={() => setNeedRefresh(false)} aria-label={t("actions.close")}>
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </Button>
      <div className="flex items-center gap-3">
        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("pwa.updateAvailable")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("pwa.updateDescription")}</p>
        </div>
      </div>
      <Button
        size="sm"
        className="mt-3 w-full"
        onClick={() => {
          navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
          void updateServiceWorker(false);
        }}
      >
        {t("actions.update")}
      </Button>
    </div>
  );
}
