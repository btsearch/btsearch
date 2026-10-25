import type { MeasurementDevice, MeasurementDeviceUpdate } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { personDevicesQueryOptions } from "../api/contributors";
import { ReasonDialog } from "../components/reasonDialog";
import { DeviceRow } from "./deviceRow";
import { DeviceWeightDialog } from "./deviceWeightDialog";
import { useDeviceUpdate } from "./personMutations";
import { PERSON_SECTION_IDS } from "./personSections";
import { StaleDataNotice } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsRowError,
  SettingsRowSkeleton,
  SettingsSection,
} from "@/features/settings/components/settingsPrimitives";
import { measurementDeviceName } from "@/features/settings/measurementQueries";
import { cn } from "@/lib/utils";

type DeviceDialogKind = "weight" | "revoke" | "restore";
type DeviceDialogState = { kind: DeviceDialogKind; device: MeasurementDevice; isOpen: boolean };

const SKELETON_ROW_COUNT = 3;

export function DevicesSection({ userId }: { userId: string }) {
  const { t } = useTranslation(["admin", "settings"]);
  const devicesQuery = useQuery(personDevicesQueryOptions(userId));
  const deviceMutation = useDeviceUpdate(userId);
  const [dialog, setDialog] = useState<DeviceDialogState | null>(null);
  const devices = devicesQuery.data;

  function openDialog(kind: DeviceDialogKind, device: MeasurementDevice) {
    setDialog({ kind, device, isOpen: true });
  }

  function hideDialog() {
    setDialog((current) => (current === null ? null : { ...current, isOpen: false }));
  }

  function closeDialog(open: boolean) {
    if (!open && !deviceMutation.isPending) hideDialog();
  }

  function isDialogOpen(kind: DeviceDialogKind): boolean {
    return dialog !== null && dialog.isOpen && dialog.kind === kind;
  }

  function changeDevice(device: MeasurementDevice, change: MeasurementDeviceUpdate, successMessage: string) {
    deviceMutation.mutate(
      { deviceId: device.id, change },
      {
        onSuccess: () => {
          hideDialog();
          toast.success(successMessage);
        },
      },
    );
  }

  let body: ReactNode;
  if (devices === undefined) {
    body = devicesQuery.isError ? (
      <SettingsRowError
        title={t("settings:measurements.devices.loadFailed")}
        onRetry={() => devicesQuery.refetch()}
        isRetrying={devicesQuery.isFetching}
      />
    ) : (
      Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => <SettingsRowSkeleton key={index} />)
    );
  } else if (devices.length === 0) {
    body = <p className={cn("px-4 py-3.5 sm:px-5", SETTINGS_DESCRIPTION_CLASS)}>{t("settings:measurements.devices.empty")}</p>;
  } else {
    body = devices.map((device) => (
      <DeviceRow
        key={device.id}
        device={device}
        onSetWeight={device.weight === undefined ? undefined : () => openDialog("weight", device)}
        onRevoke={() => openDialog("revoke", device)}
        onRestore={() => openDialog("restore", device)}
      />
    ));
  }

  const dialogDevice = dialog?.device;
  const dialogDeviceName = dialogDevice === undefined ? "" : measurementDeviceName(dialogDevice);

  function revokeDevice(reason: string) {
    if (dialogDevice === undefined) return;
    changeDevice(
      dialogDevice,
      { isRevoked: true, revocationReason: reason === "" ? undefined : reason },
      t("settings:measurements.devices.revokeSuccess"),
    );
  }

  function restoreDevice() {
    if (dialogDevice === undefined) return;
    changeDevice(dialogDevice, { isRevoked: false }, t("measurements.person.restoreDialog.success"));
  }

  return (
    <SettingsSection id={PERSON_SECTION_IDS.devices} title={t("settings:measurements.devices.title")}>
      <SettingsCard>
        <SettingsCardHeader
          title={t("measurements.person.devices.cardTitle")}
          description={t("measurements.person.devices.description")}
          action={
            devicesQuery.isRefetchError && devices !== undefined ? (
              <StaleDataNotice onRetry={() => devicesQuery.refetch()} isRetrying={devicesQuery.isFetching} />
            ) : null
          }
        />
        <div className="border-t">{body}</div>
      </SettingsCard>
      {dialogDevice?.weight === undefined ? null : (
        <DeviceWeightDialog
          device={dialogDevice}
          weight={dialogDevice.weight}
          open={isDialogOpen("weight")}
          isPending={deviceMutation.isPending}
          onOpenChange={closeDialog}
          onSubmit={(change) =>
            changeDevice(
              dialogDevice,
              change,
              change.weight === null ? t("measurements.person.deviceWeightDialog.removed") : t("measurements.person.deviceWeightDialog.saved"),
            )
          }
        />
      )}
      <ReasonDialog
        open={isDialogOpen("revoke")}
        title={t("measurements.person.revokeDialog.title")}
        description={t("measurements.person.revokeDialog.description", { name: dialogDeviceName })}
        hint={t("measurements.person.revokeDialog.reasonHint")}
        isReasonRequired={false}
        confirmLabel={t("common:actions.revoke")}
        isDestructive
        isPending={deviceMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={revokeDevice}
      />
      <ConfirmDialog
        open={isDialogOpen("restore")}
        onOpenChange={closeDialog}
        title={t("measurements.person.restoreDialog.title")}
        description={t("measurements.person.restoreDialog.description", { name: dialogDeviceName })}
        confirmLabel={t("common:actions.restore")}
        onConfirm={restoreDevice}
        pending={deviceMutation.isPending}
        destructive={false}
      />
    </SettingsSection>
  );
}
