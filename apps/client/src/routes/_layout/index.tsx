import { createFileRoute, useLocation } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { LoadingIcon } from "@/components/ui/loading-icon";
import { buildStaticPageHead } from "@/lib/seo";

const MapView = lazy(() => import("@/features/map/components/mapView"));
const OAuthConsentGate = lazy(() => import("@/components/oauth/consentGate").then((module) => ({ default: module.OAuthConsentGate })));

const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-muted/20" role="status" aria-label="Loading">
    <LoadingIcon className="size-6 text-muted-foreground" />
  </div>
);

function isOAuthConsentRequest(searchStr: string) {
  const params = new URLSearchParams(searchStr);
  return !!params.get("client_id") && params.has("sig");
}

function Page() {
  const showConsentGate = useLocation({ select: (location) => isOAuthConsentRequest(location.searchStr) });

  return (
    <div className="grid h-full min-h-0 flex-1">
      <Suspense fallback={mapFallback}>
        <MapView />
      </Suspense>
      {showConsentGate ? (
        <Suspense fallback={null}>
          <OAuthConsentGate />
        </Suspense>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/")({
  component: Page,
  head: () => buildStaticPageHead("/"),
  staticData: {
    titleKey: "items.mapView",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
