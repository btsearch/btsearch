import { ArrowReloadHorizontalIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ReloadPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh: () => setNeedRefresh(true),
  });

  const checkForUpdate = useCallback(() => {
    void navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
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

  function handleUpdate() {
    setIsUpdating(true);
    const handleControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, { once: true });
    void updateServiceWorker(false).catch(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      setIsUpdating(false);
    });
  }

  function handleDismiss() {
    setNeedRefresh(false);
  }

  return (
    <div className="fixed top-[max(1rem,calc(env(safe-area-inset-top,0rem)+0.5rem))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:top-auto sm:right-[max(1.25rem,env(safe-area-inset-right,0rem))] sm:bottom-[max(1.25rem,var(--floating-nav-bottom-padding,0.5rem))] sm:left-auto sm:w-md sm:translate-x-0">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={isUpdating}
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-popover shadow-md motion-safe:animate-in motion-safe:slide-in-from-bottom-3 motion-safe:fade-in motion-safe:duration-300 motion-safe:ease-out"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("pwa.updateAvailable")}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t("pwa.updateDescription")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 max-[380px]:flex-col">
            <Button
              size="sm"
              className="h-8 w-32 shrink-0 gap-1.5 whitespace-nowrap px-2.5 text-xs max-[380px]:w-full"
              onClick={handleUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <Spinner aria-hidden="true" className="size-3.5 text-primary-foreground" />
              ) : (
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" strokeWidth={2} />
              )}
              {isUpdating ? t("actions.updating") : t("actions.update")}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground/60 hover:text-foreground"
              onClick={handleDismiss}
              disabled={isUpdating}
              aria-label={t("actions.close")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
