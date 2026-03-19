import { ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useCookieConsent } from "@/hooks/useCookieConsent";
import { authClient } from "@/lib/authClient";

const PRIVILEGED_ROLES = new Set(["admin", "editor"]);

export function CookieConsentBanner() {
  const { t } = useTranslation("common");
  const { consent, accept, reject } = useCookieConsent();
  const { data: session } = authClient.useSession();

  if (PRIVILEGED_ROLES.has(session?.user?.role as string)) return null;
  if (consent !== null) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-5xl rounded-xl border border-border bg-popover px-4 py-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in sm:px-5"
      role="dialog"
      aria-label={t("cookieConsent.title")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <HugeiconsIcon icon={ShieldUserIcon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{t("cookieConsent.title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("cookieConsent.description")}{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
                {t("cookieConsent.learnMore")}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={reject}
            className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t("cookieConsent.decline")}
          </button>
          <button
            type="button"
            onClick={accept}
            className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("cookieConsent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
