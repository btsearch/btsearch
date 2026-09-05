import { Alert02Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { QueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BackendUnavailableError } from "@/lib/api";

export function BackendStatusProvider({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  const [isUnavailable, setIsUnavailable] = useState(false);
  const { t } = useTranslation("common");

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "error" &&
        event.action.error instanceof BackendUnavailableError &&
        event.query.state.status === "error"
      )
        setIsUnavailable(true);
    });
    return unsubscribe;
  }, [queryClient]);

  return (
    <>
      {children}
      {isUnavailable && (
        <div className="fixed bottom-5 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4">
          <div className="relative overflow-hidden rounded-xl border border-(--chart-2)/25 bg-popover shadow-md motion-safe:animate-in motion-safe:slide-in-from-bottom-3 motion-safe:fade-in duration-300 ease-out">
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--chart-2)/50 to-transparent" />

            <div className="flex items-center gap-3 p-3.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--chart-2)/10">
                <HugeiconsIcon icon={Alert02Icon} className="size-4 text-chart-2" strokeWidth={1.5} />
              </div>

              <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">{t("backendUnavailable.description")}</p>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-(--chart-2)/10 px-2.5 py-1.5 text-xs font-medium text-chart-2 transition-colors hover:bg-(--chart-2)/20"
                >
                  {t("error.reload")}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" strokeWidth={2} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsUnavailable(false)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
