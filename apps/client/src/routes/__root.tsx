import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { I18nextProvider } from "react-i18next";

import { BackendStatusProvider } from "@/components/app/backendStatus";
import { CookieConsentBanner } from "@/components/app/cookieConsentBanner";
import { ErrorBoundary } from "@/components/app/errorBoundary";
import { ReloadPrompt } from "@/components/app/reloadPrompt";
import { ThemeProvider } from "@/components/preferences/themeProvider";
import { Toaster } from "@/components/ui/sonner";
import { FloatingDialogStackProvider } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { loadAdsenseScript } from "@/hooks/useCookieConsent";
import i18n from "@/i18n/config";
import { APP_NAME } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { queryClient } from "@/lib/queryClient";
import { buildDefaultMeta } from "@/lib/seo";
import "@/index.css";

declare global {
  interface Window {
    rybbit?: {
      identify: (userId: string, traits?: Record<string, unknown>) => void;
      clearUserId: () => void;
    };
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __adsenseClient?: string;
  }
}

type AppProvidersProps = { children: ReactNode };
type AppErrorBoundaryProps = { children: ReactNode };

function AdsLoader() {
  const { data: session, isPending } = authClient.useSession();
  const isPrivileged = STAFF_ROLES.has(session?.user?.role as string);

  useEffect(() => {
    if (isPending || isPrivileged) return;

    let cancelled = false;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let graceTimer: number | null = null;
    let idleCallback: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const load = () => {
      if (!cancelled) loadAdsenseScript();
    };
    const scheduleIdleLoad = () => {
      if (cancelled) return;
      if ("requestIdleCallback" in window) idleCallback = window.requestIdleCallback(load, { timeout: 4000 });
      else fallbackTimer = setTimeout(load, 1500);
    };
    const scheduleGracePeriod = () => {
      if (!cancelled) graceTimer = window.setTimeout(scheduleIdleLoad, 3000);
    };
    const scheduleAfterPaint = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(scheduleGracePeriod);
      });
    };

    if (document.readyState === "complete") scheduleAfterPaint();
    else window.addEventListener("load", scheduleAfterPaint, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleAfterPaint);
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      if (graceTimer !== null) window.clearTimeout(graceTimer);
      if (idleCallback !== null) window.cancelIdleCallback(idleCallback);
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
  }, [isPrivileged, isPending]);

  return null;
}

function RybbitIdentify() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const prevUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!window.rybbit) return;
    if (user) {
      prevUserIdRef.current = user.id;
      window.rybbit.identify(user.id, { email: user.email, name: user.name, username: user.username });
    } else if (prevUserIdRef.current !== undefined) {
      prevUserIdRef.current = undefined;
      window.rybbit.clearUserId();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}

function SeoHead() {
  useEffect(() => {
    for (const element of document.querySelectorAll("[data-seo-inject], [data-seo-fallback]")) element.remove();
  }, []);

  return <HeadContent />;
}

function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  const pathname = useLocation({ select: (location) => location.pathname });

  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <AdsLoader />
      <RybbitIdentify />
      <AppErrorBoundary>
        <FloatingDialogStackProvider>{children}</FloatingDialogStackProvider>
      </AppErrorBoundary>
      <Toaster />
      <ReloadPrompt />
      <CookieConsentBanner />
    </>
  );
}

function RootComponent() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="ui-theme">
          <BackendStatusProvider queryClient={queryClient}>
            <AppProviders>
              <SeoHead />
              <Outlet />
            </AppProviders>
          </BackendStatusProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  head: () => {
    const adClient = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
    return {
      meta: buildDefaultMeta(APP_NAME),
      scripts: adClient
        ? [
            {
              children: `(function(){window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;window.__adsenseClient=${JSON.stringify(adClient)};var c=null;try{c=localStorage.getItem('openbts:cookie-consent');}catch(e){}var granted=c==='accepted'?'granted':'denied';gtag('consent','default',{ad_storage:granted,ad_user_data:granted,ad_personalization:granted,analytics_storage:granted});window.googlefc=window.googlefc||{};window.googlefc.controlledMessagingFunction=function(m){m.proceed(false);};})();`,
            },
          ]
        : [],
    };
  },
});
