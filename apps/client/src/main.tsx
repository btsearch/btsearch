import { RouterProvider, createRouter, stringifySearchWith } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LoadingIcon } from "@/components/ui/loading-icon";

import { routeTree } from "./routeTree.gen";

function RoutePending() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="status" aria-label="Loading">
      <LoadingIcon className="size-6 text-muted-foreground" />
    </div>
  );
}

const router = createRouter({
  routeTree,
  scrollRestoration: true,
  stringifySearch: stringifySearchWith(JSON.stringify),
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const unsubscribeFromInitialResolve = router.subscribe("onResolved", () => {
  unsubscribeFromInitialResolve();
  requestAnimationFrame(() => {
    for (const element of document.querySelectorAll("[data-seo-inject], [data-seo-fallback]")) element.remove();
  });
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
