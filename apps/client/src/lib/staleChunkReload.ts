const RELOADED_AT_KEY = "openbts:chunk-reload-at";
const RELOAD_GUARD_MS = 60_000;
const WORKER_TAKEOVER_TIMEOUT_MS = 5000;

let isReloadPending = false;

function hasReloadedRecently(now: number): boolean {
  try {
    const reloadedAt = Number(window.sessionStorage.getItem(RELOADED_AT_KEY));
    return reloadedAt > 0 && Math.abs(now - reloadedAt) < RELOAD_GUARD_MS;
  } catch {
    return true;
  }
}

function rememberReload(now: number): boolean {
  try {
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function waitForNewController(newWorker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, WORKER_TAKEOVER_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    const skipWaitingOnceInstalled = () => {
      if (newWorker.state === "installed") newWorker.postMessage({ type: "SKIP_WAITING" });
    };
    newWorker.addEventListener("statechange", skipWaitingOnceInstalled);
    skipWaitingOnceInstalled();
  });
}

async function activateNewestServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  await registration.update().catch(() => undefined);
  const newWorker = registration.waiting ?? registration.installing;
  if (newWorker) await waitForNewController(newWorker);
}

async function reloadOnNewestBundle(): Promise<void> {
  await activateNewestServiceWorker().catch(() => undefined);
  window.location.reload();
}

function handlePreloadError(event: Event): void {
  if (isReloadPending) {
    event.preventDefault();
    return;
  }

  const now = Date.now();
  if (hasReloadedRecently(now) || !rememberReload(now)) return;

  isReloadPending = true;
  event.preventDefault();
  void reloadOnNewestBundle();
}

export function reloadOnceOnChunkLoadError(): void {
  window.addEventListener("vite:preloadError", handlePreloadError);
}
