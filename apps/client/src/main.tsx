import { RouterProvider, createRouter, stringifySearchWith } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LoadingIcon } from "@/components/ui/loading-icon";
import { i18nReady } from "@/i18n/config";

import { routeTree } from "./routeTree.gen";

const I18N_READY_TIMEOUT_MS = 2000;

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

function removeAppShell() {
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.dataset.hiding = "true";
  setTimeout(() => shell.remove(), 200);
}

const unsubscribeFromInitialResolve = router.subscribe("onResolved", () => {
  unsubscribeFromInitialResolve();
  requestAnimationFrame(() => {
    for (const element of document.querySelectorAll("[data-seo-inject], [data-seo-fallback]")) element.remove();
  });
});

function removeAppShellWhenMounted(rootElement: HTMLElement) {
  const tick = () => {
    if (rootElement.childElementCount > 0) removeAppShell();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderApp() {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element not found");
  if (rootElement.innerHTML) return;

  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  removeAppShellWhenMounted(rootElement);
}

router.load().catch(() => {});
const i18nReadyOrTimeout = Promise.race([i18nReady, new Promise((resolve) => setTimeout(resolve, I18N_READY_TIMEOUT_MS))]);
void i18nReadyOrTimeout.then(renderApp, renderApp);
