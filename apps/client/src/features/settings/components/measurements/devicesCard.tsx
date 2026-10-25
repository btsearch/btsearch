import { SmartPhone01Icon } from "@hugeicons/core-free-icons";
import type { MeasurementDevice, MeasurementDeviceTier } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../../authErrors";
import {
  measurementDeviceHardwareName,
  measurementDeviceName,
  measurementDevicesQueryOptions,
  revokeMeasurementDevice,
} from "../../measurementQueries";
import { ConfirmDialog } from "../confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowPanel,
  SettingsRowSkeleton,
  SettingsRowToggle,
  StatusBadge,
} from "../settingsPrimitives";
import { DeviceCalibration, DeviceCalibrationSummary } from "./deviceCalibration";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { useRelativeTime } from "@/components/ui/relative-time";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEVICE_TIER_TONES: Record<MeasurementDeviceTier, "success" | "muted"> = {
  strong: "success",
  hardware: "success",
  software: "muted",
  none: "muted",
};

function DeviceLastUpload({ date }: { date: string }) {
  const { t } = useTranslation("settings");
  const time = useRelativeTime(date);

  return t("measurements.devices.lastUpload", { time });
}

function DeviceRow({ device, onRevoke }: { device: MeasurementDevice; onRevoke: () => void }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const [isCalibrationOpen, setCalibrationOpen] = useState(false);
  const { tier } = device.attestation;
  const { revocation } = device;

  const row = (
    <SettingsRow
      wrap
      icon={SmartPhone01Icon}
      title={measurementDeviceName(device)}
      badge={
        revocation === null ? (
          <StatusBadge tone={DEVICE_TIER_TONES[tier]}>{t(`measurements.devices.tiers.${tier}`)}</StatusBadge>
        ) : (
          <StatusBadge tone="muted">{t("measurements.devices.revoked")}</StatusBadge>
        )
      }
      description={
        <>
          <SettingsMeta>
            {device.label !== null ? <SettingsMetaItem>{measurementDeviceHardwareName(device)}</SettingsMetaItem> : null}
            {revocation === null ? (
              <>
                <SettingsMetaItem>
                  {device.lastUploadAt !== null ? <DeviceLastUpload date={device.lastUploadAt} /> : t("measurements.devices.noUploads")}
                </SettingsMetaItem>
                <SettingsMetaItem>{t("security.passkeys.addedOn", { date: formatShortDate(device.createdAt, i18n.language) })}</SettingsMetaItem>
                <SettingsMetaItem>
                  <DeviceCalibrationSummary timingAdvance={device.timingAdvance} />
                </SettingsMetaItem>
              </>
            ) : (
              <SettingsMetaItem>{t("measurements.devices.revokedOn", { date: formatShortDate(revocation.at, i18n.language) })}</SettingsMetaItem>
            )}
          </SettingsMeta>
          {revocation === null || revocation.reason === null ? null : (
            <span className="block">{t("measurements.reason", { reason: revocation.reason })}</span>
          )}
        </>
      }
    >
      {revocation === null ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
            onClick={onRevoke}
          >
            {t("common:actions.revoke")}
          </Button>
          <SettingsRowToggle
            isOpen={isCalibrationOpen}
            label={isCalibrationOpen ? t("measurements.devices.calibration.hide") : t("measurements.devices.calibration.show")}
          />
        </>
      ) : null}
    </SettingsRow>
  );

  if (revocation !== null) return row;

  return (
    <Collapsible open={isCalibrationOpen} onOpenChange={setCalibrationOpen} className="border-t first:border-t-0">
      {row}
      <SettingsRowPanel>
        <DeviceCalibration timingAdvance={device.timingAdvance} />
      </SettingsRowPanel>
    </Collapsible>
  );
}

export function DevicesCard({ userId }: { userId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { data: devices, isPending, isError, isFetching, refetch } = useQuery(measurementDevicesQueryOptions(userId));
  const [revokeTarget, setRevokeTarget] = useState<MeasurementDevice | null>(null);

  const revokeMutation = useMutation({
    mutationFn: revokeMeasurementDevice,
    onSuccess: () => {
      setRevokeTarget(null);
      toast.success(t("measurements.devices.revokeSuccess"));
      void queryClient.invalidateQueries({ queryKey: measurementDevicesQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const orderedDevices = [...(devices ?? [])].sort((left, right) => Number(left.revocation !== null) - Number(right.revocation !== null));

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.devices.title")} description={t("measurements.devices.description")} />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : isError ? (
          <SettingsRowError title={t("measurements.devices.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : orderedDevices.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("measurements.devices.empty")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("measurements.devices.emptyDescription")}</p>
          </div>
        ) : (
          orderedDevices.map((device) => <DeviceRow key={device.id} device={device} onRevoke={() => setRevokeTarget(device)} />)
        )}
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={t("measurements.devices.revokeConfirmTitle")}
        description={t("measurements.devices.revokeConfirmDescription", { name: revokeTarget === null ? "" : measurementDeviceName(revokeTarget) })}
        confirmLabel={t("common:actions.revoke")}
        pending={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) revokeMutation.mutate(revokeTarget.id);
        }}
      />
    </SettingsCard>
  );
}
