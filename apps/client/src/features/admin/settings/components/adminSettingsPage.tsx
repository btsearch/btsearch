import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";

import { isConfirmationOpen } from "../utils/saveShortcut";
import { AdminSettingsSections } from "./adminSettingsSections";
import { AdminSettingsSkeleton } from "./adminSettingsSkeleton";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { useNavMode } from "@/hooks/usePreferences";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { settingsQueryOptions } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

const AUDIT_LOG_LINK = (
  <Link
    to="/admin/audit-logs"
    className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
  />
);

function AdminSettingsHead({ notice }: { notice: ReactNode }) {
  const { t } = useTranslation("admin");

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans t={t} i18nKey="settings.lead" components={{ auditLog: AUDIT_LOG_LINK }} />
        </p>
      </div>
      {notice}
    </header>
  );
}

export function AdminSettingsPage() {
  const { t } = useTranslation("admin");
  const navMode = useNavMode();
  const announcementFormRef = useRef<HTMLFormElement>(null);
  const { data: settings, isLoading, isFetching, isRefetchError, refetch } = useQuery({ ...settingsQueryOptions(), staleTime: 0 });

  function submitAnnouncement() {
    if (!isConfirmationOpen()) announcementFormRef.current?.requestSubmit();
  }

  useSaveShortcut({ canSave: true, onSave: submitAnnouncement });

  if (!isLoading && settings === undefined) {
    return (
      <PageErrorState
        title={t("settings.errorTitle")}
        description={t("settings.errorDescription")}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("flex w-full flex-col gap-10 px-3 pt-5 sm:gap-12 sm:px-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>
        <AdminSettingsHead notice={isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null} />
        {settings === undefined ? <AdminSettingsSkeleton /> : <AdminSettingsSections settings={settings} announcementFormRef={announcementFormRef} />}
      </div>
    </div>
  );
}
