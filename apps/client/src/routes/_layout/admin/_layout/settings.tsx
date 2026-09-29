import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  DatabaseIcon,
  Image01Icon,
  Message01Icon,
  SentIcon,
  ShieldUserIcon,
  TaskDaily01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  type RuntimeSettings,
  type SettingsPatch,
  cleanupRejectedPhotos,
  cleanupSubmissions,
  fetchSettings,
  patchSettings,
} from "@/features/admin/settings/api";
import { settingsQueryOptions } from "@/hooks/useSettings";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-md transform transition-transform",
          checked ? "translate-x-4.5" : "translate-x-1",
        )}
      />
    </button>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
  disabled = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 p-2 rounded-md border bg-background min-h-9.5",
        !disabled && "border-input hover:border-muted-foreground/50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
        disabled && "opacity-60",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full border border-primary/20"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-primary/70 hover:text-primary rounded-full hover:bg-primary/10 p-0.5 transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            </button>
          )}
        </span>
      ))}
      <Input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="flex-1 min-w-25 border-0 p-0 h-auto text-xs focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

function SettingsCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted text-muted-foreground">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function AdminSettingsPage() {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const [patch, setPatch] = useState<Partial<RuntimeSettings>>({});

  const {
    data: settings,
    isLoading,
    isFetching,
    isRefetchError,
    refetch,
  } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: fetchSettings,
  });

  const formData: RuntimeSettings = useMemo(
    () =>
      settings
        ? {
            ...settings,
            ...patch,
          }
        : {
            enforceAuthForAllRoutes: false,
            allowedUnauthenticatedRoutes: [],
            disabledRoutes: [],
            enableStationComments: false,
            commentQueueEnabled: false,
            submissionsEnabled: true,
            photosEnabled: true,
            enableUserLists: false,
            announcement: { message: "", enabled: false, type: "info" as const },
          },
    [settings, patch],
  );

  const hasChanges = useMemo(() => {
    if (!settings) return false;
    return (
      formData.enforceAuthForAllRoutes !== settings.enforceAuthForAllRoutes ||
      formData.enableStationComments !== settings.enableStationComments ||
      formData.commentQueueEnabled !== settings.commentQueueEnabled ||
      formData.submissionsEnabled !== settings.submissionsEnabled ||
      formData.photosEnabled !== settings.photosEnabled ||
      formData.enableUserLists !== settings.enableUserLists ||
      JSON.stringify(formData.allowedUnauthenticatedRoutes) !== JSON.stringify(settings.allowedUnauthenticatedRoutes) ||
      JSON.stringify(formData.disabledRoutes) !== JSON.stringify(settings.disabledRoutes) ||
      JSON.stringify(formData.announcement) !== JSON.stringify(settings.announcement)
    );
  }, [settings, formData]);

  useEffect(() => {
    if (!showSaveSuccess) return;
    const id = setTimeout(() => setShowSaveSuccess(false), 3000);
    return () => clearTimeout(id);
  }, [showSaveSuccess]);

  const mutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: (newSettings) => {
      queryClient.setQueryData(["admin-settings"], newSettings);
      void queryClient.invalidateQueries({ queryKey: settingsQueryOptions().queryKey });
      setPatch({});
      setShowSaveSuccess(true);
    },
    onError: showApiError,
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupSubmissions,
    onSuccess: (result) => {
      toast.success(t("settings.cleanupSuccess", { count: result.cleaned }));
    },
    onError: () => {
      toast.error(t("settings.cleanupError"));
    },
  });

  const cleanupPhotosMutation = useMutation({
    mutationFn: cleanupRejectedPhotos,
    onSuccess: (result) => {
      toast.success(t("settings.cleanupPhotosSuccess", { count: result.deleted }));
    },
    onError: () => {
      toast.error(t("settings.cleanupPhotosError"));
    },
  });

  const handleSave = useCallback(() => {
    const patch: SettingsPatch = {};
    if (settings) {
      if (formData.enforceAuthForAllRoutes !== settings.enforceAuthForAllRoutes) {
        patch.enforceAuthForAllRoutes = formData.enforceAuthForAllRoutes;
      }
      if (formData.enableStationComments !== settings.enableStationComments) {
        patch.enableStationComments = formData.enableStationComments;
      }
      if (formData.commentQueueEnabled !== settings.commentQueueEnabled) {
        patch.commentQueueEnabled = formData.commentQueueEnabled;
      }
      if (formData.submissionsEnabled !== settings.submissionsEnabled) {
        patch.submissionsEnabled = formData.submissionsEnabled;
      }
      if (formData.photosEnabled !== settings.photosEnabled) {
        patch.photosEnabled = formData.photosEnabled;
      }
      if (formData.enableUserLists !== settings.enableUserLists) {
        patch.enableUserLists = formData.enableUserLists;
      }
      if (JSON.stringify(formData.allowedUnauthenticatedRoutes) !== JSON.stringify(settings.allowedUnauthenticatedRoutes)) {
        patch.allowedUnauthenticatedRoutes = formData.allowedUnauthenticatedRoutes;
      }
      if (JSON.stringify(formData.disabledRoutes) !== JSON.stringify(settings.disabledRoutes)) {
        patch.disabledRoutes = formData.disabledRoutes;
      }
      if (JSON.stringify(formData.announcement) !== JSON.stringify(settings.announcement)) {
        patch.announcement = formData.announcement;
      }
    }
    mutation.mutate(patch);
  }, [formData, settings, mutation]);

  const handleReset = useCallback(() => setPatch({}), []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner className="size-8 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">{t("common:actions.loading")}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <PageErrorState
        title={t("settings.errorTitle")}
        description={t("settings.errorDescription")}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  let saveBar: React.ReactNode = null;
  if (showSaveSuccess) {
    saveBar = (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
        <span className="text-sm font-medium">{t("common:actions.saved")}</span>
      </div>
    );
  } else if (hasChanges) {
    saveBar = (
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          {t("common:actions.revert", "Reset")}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending && <Spinner className="size-4 mr-2" />}
          {t("common:actions.saveChanges")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("settings.subtitle")}</p>
        </div>

        {saveBar}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 pb-8 max-w-4xl">
          {isRefetchError ? <StaleDataNotice className="justify-self-start" onRetry={() => refetch()} isRetrying={isFetching} /> : null}
          <SettingsCard
            icon={<HugeiconsIcon icon={ShieldUserIcon} className="size-4" />}
            title={t("settings.authentication")}
            description={t("settings.authenticationDesc")}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="text-sm font-medium">{t("settings.enforceAuth")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.enforceAuthDesc")}</p>
                </div>
                <Toggle
                  checked={formData.enforceAuthForAllRoutes}
                  onChange={(checked) => setPatch((prev) => ({ ...prev, enforceAuthForAllRoutes: checked }))}
                />
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">{t("settings.allowedRoutes")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.allowedRoutesDesc")}</p>
                </div>
                <TagInput
                  tags={formData.allowedUnauthenticatedRoutes}
                  onChange={(tags) => setPatch((prev) => ({ ...prev, allowedUnauthenticatedRoutes: tags }))}
                  placeholder="e.g., /api/v1/public"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">{t("settings.disabledRoutes")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.disabledRoutesDesc")}</p>
                </div>
                <TagInput
                  tags={formData.disabledRoutes}
                  onChange={(tags) => setPatch((prev) => ({ ...prev, disabledRoutes: tags }))}
                  placeholder="e.g., /api/v1/admin"
                />
              </div>
            </div>
          </SettingsCard>

          <div className="grid md:grid-cols-2 gap-4">
            <SettingsCard
              icon={<HugeiconsIcon icon={Message01Icon} className="size-4" />}
              title={t("settings.comments")}
              description={t("settings.commentsDesc")}
            >
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium">{t("settings.enableComments")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.enableStationComments ? t("settings.commentsEnabled") : t("settings.commentsDisabled")}
                  </p>
                </div>
                <Toggle
                  checked={formData.enableStationComments}
                  onChange={(checked) => setPatch((prev) => ({ ...prev, enableStationComments: checked }))}
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <div>
                  <p className="text-sm font-medium">{t("settings.commentQueue")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.commentQueueEnabled ? t("settings.commentQueueEnabled") : t("settings.commentQueueDisabled")}
                  </p>
                </div>
                <Toggle
                  checked={formData.commentQueueEnabled}
                  onChange={(checked) => setPatch((prev) => ({ ...prev, commentQueueEnabled: checked }))}
                />
              </div>
            </SettingsCard>

            <SettingsCard
              icon={<HugeiconsIcon icon={SentIcon} className="size-4" />}
              title={t("settings.submissions")}
              description={t("settings.submissionsDesc")}
            >
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium">{t("settings.enableSubmissions")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.submissionsEnabled ? t("settings.submissionsEnabled") : t("settings.submissionsDisabled")}
                  </p>
                </div>
                <Toggle
                  checked={formData.submissionsEnabled}
                  onChange={(checked) => setPatch((prev) => ({ ...prev, submissionsEnabled: checked }))}
                />
              </div>
            </SettingsCard>

            <SettingsCard
              icon={<HugeiconsIcon icon={Image01Icon} className="size-4" />}
              title={t("settings.photos")}
              description={t("settings.photosDesc")}
            >
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium">{t("settings.enablePhotos")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.photosEnabled ? t("settings.photosEnabled") : t("settings.photosDisabled")}
                  </p>
                </div>
                <Toggle checked={formData.photosEnabled} onChange={(checked) => setPatch((prev) => ({ ...prev, photosEnabled: checked }))} />
              </div>
            </SettingsCard>

            <SettingsCard
              icon={<HugeiconsIcon icon={TaskDaily01Icon} className="size-4" />}
              title={t("settings.userLists")}
              description={t("settings.userListsDesc")}
            >
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium">{t("settings.enableUserLists")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.enableUserLists ? t("settings.userListsEnabled") : t("settings.userListsDisabled")}
                  </p>
                </div>
                <Toggle checked={formData.enableUserLists} onChange={(checked) => setPatch((prev) => ({ ...prev, enableUserLists: checked }))} />
              </div>
            </SettingsCard>
          </div>

          <SettingsCard
            icon={<HugeiconsIcon icon={Alert02Icon} className="size-4" />}
            title={t("settings.announcement")}
            description={t("settings.announcementDesc")}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="text-sm font-medium">{t("settings.enableAnnouncement")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formData.announcement?.enabled ? t("settings.announcementEnabled") : t("settings.announcementDisabled")}
                  </p>
                </div>
                <Toggle
                  checked={formData.announcement?.enabled ?? false}
                  onChange={(checked) =>
                    setPatch((prev) => ({
                      ...prev,
                      announcement: { ...(formData.announcement ?? { message: "", type: "info" as const }), enabled: checked },
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t("settings.announcementType")}</p>
                <div className="flex gap-2">
                  {(["info", "warning", "error"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setPatch((prev) => ({
                          ...prev,
                          announcement: { ...(formData.announcement ?? { message: "", enabled: false }), type },
                        }))
                      }
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                        formData.announcement?.type === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:bg-muted",
                      )}
                    >
                      {t(`settings.announcementType${type.charAt(0).toUpperCase() + type.slice(1)}` as "settings.announcementTypeInfo")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t("settings.announcementMessage")}</p>
                <Input
                  value={formData.announcement?.message ?? ""}
                  onChange={(e) =>
                    setPatch((prev) => ({
                      ...prev,
                      announcement: {
                        ...(formData.announcement ?? { enabled: false, type: "info" as const }),
                        message: e.target.value,
                      },
                    }))
                  }
                  placeholder={t("settings.announcementMessagePlaceholder")}
                  className="text-sm"
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<HugeiconsIcon icon={DatabaseIcon} className="size-4" />}
            title={t("settings.cleanupTitle")}
            description={t("settings.cleanupDesc")}
          >
            <div className="flex items-center justify-between pt-1">
              <Button size="sm" variant="destructive" onClick={() => cleanupMutation.mutate()} disabled={cleanupMutation.isPending}>
                {cleanupMutation.isPending && <Spinner className="size-4 mr-2" />}
                {t("settings.cleanupRun")}
              </Button>
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<HugeiconsIcon icon={Image01Icon} className="size-4" />}
            title={t("settings.cleanupPhotosTitle")}
            description={t("settings.cleanupPhotosDesc")}
          >
            <div className="flex items-center justify-between pt-1">
              <Button size="sm" variant="destructive" onClick={() => cleanupPhotosMutation.mutate()} disabled={cleanupPhotosMutation.isPending}>
                {cleanupPhotosMutation.isPending && <Spinner className="size-4 mr-2" />}
                {t("settings.cleanupPhotosRun")}
              </Button>
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/settings")({
  component: AdminSettingsPage,
  staticData: {
    titleKey: "breadcrumbs.settings",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
  },
});
