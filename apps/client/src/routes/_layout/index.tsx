import { absoluteSiteUrl } from "@openbts/shared/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { OAuthConsentGate } from "@/components/oauth/consentGate";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { getBrowserOrigin } from "@/lib/seo";

const MapView = lazy(() => import("@/features/map/components/mapView"));

const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-muted/20" role="status" aria-label="Loading">
    <LoadingIcon className="size-6 text-muted-foreground" />
  </div>
);

function Page() {
  return (
    <div className="h-full min-h-0 flex-1">
      <Suspense fallback={mapFallback}>
        <MapView />
      </Suspense>
      <OAuthConsentGate />
    </div>
  );
}

export const Route = createFileRoute("/_layout/")({
  component: Page,
  head: () => {
    const homeUrl = absoluteSiteUrl(getBrowserOrigin(), "/");
    return {
      meta: [{ property: "og:url", content: homeUrl }],
      links: [{ rel: "canonical", href: homeUrl }],
    };
  },
  staticData: {
    titleKey: "items.mapView",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
