import { SmartPhone01Icon } from "@hugeicons/core-free-icons";
import type { MeasurementDevice, MeasurementDeviceTier } from "@openbts/shared/contract";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { DESTRUCTIVE_GHOST_CLASS } from "../components/classNames";
import { formatWeight } from "../utils/format";
import { getDeviceWeightBasis, listAttestationParts, listHardwareParts, listSoftwareParts } from "./deviceText";
import { Button } from "@/components/ui/button";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsIconTile,
  SettingsMeta,
  SettingsMetaItem,
  StatusBadge,
} from "@/features/settings/components/settingsPrimitives";
import { measurementDeviceName } from "@/features/settings/measurementQueries";
import { cn } from "@/lib/utils";

type DeviceRowProps = {
  device: MeasurementDevice;
  onSetWeight?: () => void;
  onRevoke: () => void;
  onRestore: () => void;
};

const DEVICE_TIER_TONES: Record<MeasurementDeviceTier, ComponentProps<typeof StatusBadge>["tone"]> = {
  strong: "success",
  hardware: "primary",
  software: "warning",
  none: "muted",
};

function MetaLine({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;

  return (
    <SettingsMeta>
      {parts.map((part, index) => (
        <SettingsMetaItem key={index}>{part}</SettingsMetaItem>
      ))}
    </SettingsMeta>
  );
}

function DeviceWeight({ device }: { device: MeasurementDevice }) {
  const { t, i18n } = useTranslation("admin");
  if (device.revocation !== null || device.weight === undefined) return null;

  return (
    <div className="flex min-w-0 flex-col @3xl:w-[190px] @3xl:items-end @3xl:text-right">
      <span className="text-sm leading-5 font-semibold tabular-nums">
        {t("measurements.person.weightValue", { weight: formatWeight(device.weight.effective, i18n.language) })}
      </span>
      <span className="text-xs leading-4 text-muted-foreground">{getDeviceWeightBasis(t, i18n.language, device.weight)}</span>
    </div>
  );
}

export function DeviceRow({ device, onSetWeight, onRevoke, onRestore }: DeviceRowProps) {
  const { t, i18n } = useTranslation(["admin", "settings"]);
  const { tier } = device.attestation;
  const isRevoked = device.revocation !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 border-t px-4 py-3.5 first:border-t-0 sm:px-5 @3xl:flex-nowrap">
      <SettingsIconTile icon={SmartPhone01Icon} className={cn(isRevoked && "opacity-60")} />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-5 font-medium">{measurementDeviceName(device)}</p>
          <StatusBadge tone={DEVICE_TIER_TONES[tier]}>{t(`settings:measurements.devices.tiers.${tier}`)}</StatusBadge>
          {isRevoked ? <StatusBadge tone="destructive">{t("settings:measurements.devices.revoked")}</StatusBadge> : null}
        </div>
        <div className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>
          <MetaLine parts={listHardwareParts(t, i18n.language, device)} />
          <MetaLine parts={listAttestationParts(t, device)} />
          <MetaLine parts={listSoftwareParts(t, i18n.language, device)} />
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-3.5 @3xl:w-auto @3xl:shrink-0">
        <DeviceWeight device={device} />
        <div className="ml-auto flex items-center justify-end gap-1.5 @3xl:w-[196px]">
          {isRevoked ? (
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onRestore}>
              {t("common:actions.restore")}
            </Button>
          ) : (
            <>
              {onSetWeight === undefined ? null : (
                <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onSetWeight}>
                  {t("measurements.person.devices.setWeight")}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className={DESTRUCTIVE_GHOST_CLASS} onClick={onRevoke}>
                {t("common:actions.revoke")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
