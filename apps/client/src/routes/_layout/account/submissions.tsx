import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { RequireAuth } from "@/components/auth/requireAuth";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { MySubmissions } from "@/features/account/components/mySubmissions";
import { useFeatureGate } from "@/hooks/useFeatureGate";

function MySubmissionsPage() {
  const { t } = useTranslation("submissions");
  const { hasLoadError, isDisabled, isRetrying, retry } = useFeatureGate("submissionsEnabled");

  if (hasLoadError) return <PageErrorState onRetry={() => retry()} isRetrying={isRetrying} />;
  if (isDisabled) return <Navigate to="/" replace />;

  return (
    <RequireAuth>
      <main className="flex-1 flex flex-col min-h-0 pl-3 pt-3 pr-3 gap-3">
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">{t("nav:items.mySubmissions")}</h1>
            <p className="text-muted-foreground text-sm">{t("userPage.description")}</p>
          </div>
          <Button size="sm" nativeButton={false} render={<Link to="/submission" />}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {t("submitNew")}
          </Button>
        </div>
        <MySubmissions />
      </main>
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/account/submissions")({
  component: MySubmissionsPage,
  staticData: {
    titleKey: "items.mySubmissions",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "labels.account", i18nNamespace: "common", path: "/settings" }],
  },
});
