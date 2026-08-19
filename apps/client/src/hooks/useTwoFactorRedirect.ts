import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TwoFactorRequiredError } from "@/lib/api";

export function useTwoFactorRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation("settings");

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "error" &&
        event.action.error instanceof TwoFactorRequiredError &&
        !location.pathname.startsWith("/settings")
      ) {
        toast.info(t("twoFactor.setupRequired"));
        void navigate({ to: "/settings", search: { tab: "security" }, replace: true });
      }
    });

    return unsubscribe;
  }, [navigate, location.pathname, queryClient, t]);
}
