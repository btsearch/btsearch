import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Link as RouterLink, createRootRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { I18nextProvider } from "react-i18next";

import { BackendStatusProvider } from "@/components/backend-status";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { ReloadPrompt } from "@/components/reload-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { FloatingDialogStackProvider } from "@/features/station-details/components/floatingDialogStackProvider";
import { loadAdsenseScript } from "@/hooks/useCookieConsent";
import { plPLAuthLocalization } from "@/i18n/authLocalization";
import i18n from "@/i18n/config";
import { authClient } from "@/lib/authClient";
import { queryClient } from "@/lib/queryClient";
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

type AuthLinkProps = { href: string; className?: string; children: ReactNode };
type AppProvidersProps = { children: ReactNode };

const ADS_PRIVILEGED_ROLES = new Set(["admin", "editor"]);

function AdsLoader() {
  const { data: session, isPending } = authClient.useSession();
  const isPrivileged = ADS_PRIVILEGED_ROLES.has(session?.user?.role as string);

  useEffect(() => {
    if (isPending || isPrivileged) return;
    loadAdsenseScript();
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

function AppProviders({ children }: AppProvidersProps) {
  const navigate = useNavigate();
  const { i18n: i18nInstance } = useTranslation();
  const localization = i18nInstance.language === "pl-PL" ? plPLAuthLocalization : undefined;

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={(path) => navigate({ to: path })}
      replace={(path) => navigate({ to: path, replace: true })}
      basePath="/account"
      Link={AuthLink}
      onSessionChange={() => queryClient.invalidateQueries()}
      social={{
        providers: ["github", "google"],
      }}
      passkey
      multiSession
      deleteUser={true}
      twoFactor={["totp"]}
      localization={localization}
    >
      <AdsLoader />
      <RybbitIdentify />
      <ErrorBoundary>
        <FloatingDialogStackProvider>{children}</FloatingDialogStackProvider>
      </ErrorBoundary>
      <Toaster />
      <ReloadPrompt />
      <CookieConsentBanner />
    </AuthUIProvider>
  );
}

function RootComponent() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="ui-theme">
          <BackendStatusProvider queryClient={queryClient}>
            <AppProviders>
              <HeadContent />
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
    const rybbitSiteId = import.meta.env.VITE_RYBBIT_SITE_ID as string | undefined;
    const gitCommit = import.meta.env.VITE_GIT_COMMIT as string | undefined;
    return {
      scripts: [
        ...(rybbitSiteId
          ? [
              {
                src: "https://statistics.btsearch.pl/api/script.js",
                "data-site-id": rybbitSiteId,
                "data-skip-patterns": ["/admin/**"],
                ...(gitCommit ? { "data-tag": gitCommit } : {}),
                defer: true,
              },
            ]
          : []),
        ...(adClient
          ? [
              {
                children: `(function(){window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;window.__adsenseClient=${JSON.stringify(adClient)};var c=null;try{c=localStorage.getItem('openbts:cookie-consent');}catch(e){}var granted=c==='accepted'?'granted':'denied';gtag('consent','default',{ad_storage:granted,ad_user_data:granted,ad_personalization:granted,analytics_storage:granted});window.googlefc=window.googlefc||{};window.googlefc.controlledMessagingFunction=function(m){m.proceed(false);};})();`,
              },
            ]
          : []),
      ],
    };
  },
});
