import { Settings02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../hooks/useSettingsSave";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard, SettingsCardHeader, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";

export function MaintenanceCard({ isMaintenanceMode }: { isMaintenanceMode: boolean }) {
  const { t } = useTranslation("admin");
  const titleId = useId();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const save = useSettingsSave({ isOptimistic: false });

  function changeMaintenanceMode(isEnabled: boolean) {
    if (save.isPending) return;
    if (isEnabled) setIsConfirmOpen(true);
    else save.mutate({ isMaintenanceMode: false });
  }

  function enableMaintenanceMode() {
    if (!isConfirmOpen || save.isPending) return;

    setIsConfirmOpen(false);
    save.mutate({ isMaintenanceMode: true });
  }

  return (
    <SettingsCard aria-busy={save.isPending}>
      <SettingsCardHeader
        icon={Settings02Icon}
        title={t("settings.maintenance.title")}
        titleId={titleId}
        description={t("settings.maintenance.description")}
        action={
          <>
            {save.isPending ? <Spinner className="size-4 text-muted-foreground" /> : null}
            <Switch
              checked={isMaintenanceMode}
              onCheckedChange={changeMaintenanceMode}
              disabled={save.isPending}
              aria-labelledby={titleId}
              className="cursor-pointer"
            />
          </>
        }
      />
      <SettingsCardNote>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>{t("settings.maintenance.note")}</span>
          <Button variant="link" size="xs" nativeButton={false} render={<Link to="/maintenance" />} className="h-auto px-0">
            {t("settings.maintenance.preview")}
          </Button>
        </div>
      </SettingsCardNote>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("settings.maintenance.confirm.title")}
        description={t("settings.maintenance.confirm.description")}
        confirmLabel={t("settings.maintenance.confirm.action")}
        onConfirm={enableMaintenanceMode}
        destructive={false}
      />
    </SettingsCard>
  );
}
