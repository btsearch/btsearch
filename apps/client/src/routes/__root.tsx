import type { AuthClient } from "@better-auth-ui/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Link as RouterLink, createRootRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { I18nextProvider } from "react-i18next";

import { BackendStatusProvider } from "@/components/app/backend-status";
import { CookieConsentBanner } from "@/components/app/cookie-consent-banner";
import { ErrorBoundary } from "@/components/app/error-boundary";
import { ReloadPrompt } from "@/components/app/reload-prompt";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/preferences/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { FloatingDialogStackProvider } from "@/features/station-details/components/floatingDialogStackProvider";
import { loadAdsenseScript } from "@/hooks/useCookieConsent";
import {
  plPLAuthLocalization,
  plPLDeleteUserLocalization,
  plPLMultiSessionLocalization,
  plPLPasskeyLocalization,
  plPLTwoFactorLocalization,
  plPLUsernameLocalization,
} from "@/i18n/authLocalization";
import i18n from "@/i18n/config";
import { APP_NAME } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin";
import { multiSessionPlugin } from "@/lib/auth/multi-session-plugin";
import { passkeyPlugin } from "@/lib/auth/passkey-plugin";
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin";
import { usernamePlugin } from "@/lib/auth/username-plugin";
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

type AuthLinkProps = { href: string; className?: string; children?: ReactNode };
type AppProvidersProps = { children: ReactNode };

const ADS_PRIVILEGED_ROLES = new Set(["admin", "editor"]);

function AdsLoader() {
  const { data: session, isPending } = authClient.useSession();
  const isPrivileged = ADS_PRIVILEGED_ROLES.has(session?.user?.role as string);

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

function AuthLink({ href, ...props }: AuthLinkProps) {
  return <RouterLink to={href} {...props} />;
}

function SeoHead() {
  useEffect(() => {
    for (const element of document.querySelectorAll("[data-seo-inject], [data-seo-fallback]")) element.remove();
  }, []);

  return <HeadContent />;
}

function AppProviders({ children }: AppProvidersProps) {
  const navigate = useNavigate();
  const { i18n: i18nInstance } = useTranslation();
  const isPolish = i18nInstance.language === "pl-PL";

  const plugins = useMemo(
    () => [
      twoFactorPlugin(isPolish ? { localization: plPLTwoFactorLocalization } : {}),
      passkeyPlugin(isPolish ? { localization: plPLPasskeyLocalization } : {}),
      multiSessionPlugin(isPolish ? { localization: plPLMultiSessionLocalization } : {}),
      deleteUserPlugin(isPolish ? { localization: plPLDeleteUserLocalization } : {}),
      usernamePlugin(isPolish ? { localization: plPLUsernameLocalization } : {}),
    ],
    [isPolish],
  );

  return (
    <AuthProvider
      authClient={authClient as unknown as AuthClient}
      queryClient={queryClient}
      navigate={navigate}
      basePaths={{ auth: "/account" }}
      Link={AuthLink}
      socialProviders={["github", "google"]}
      plugins={plugins}
      localization={isPolish ? plPLAuthLocalization : undefined}
    >
      <AdsLoader />
      <RybbitIdentify />
      <ErrorBoundary>
        <FloatingDialogStackProvider>{children}</FloatingDialogStackProvider>
      </ErrorBoundary>
      <Toaster />
      <ReloadPrompt />
      <CookieConsentBanner />
    </AuthProvider>
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
