import type { MeasurementDevice, MeasurementDeviceWeight } from "@openbts/shared/contract";
import type { TFunction } from "i18next";

import { formatWeight } from "../utils/format";
import { measurementDeviceHardwareName } from "@/features/settings/measurementQueries";
import { formatDateTime, formatShortDate, formatShortUtcDate } from "@/lib/format";

const ANDROID_VERSIONS: Partial<Record<number, string>> = {
  26: "8.0",
  27: "8.1",
  28: "9",
  29: "10",
  30: "11",
  31: "12",
  32: "12L",
  33: "13",
  34: "14",
  35: "15",
  36: "16",
};

function getAndroidVersion(t: TFunction, sdkInt: number): string {
  const version = ANDROID_VERSIONS[sdkInt];
  return version === undefined
    ? t("measurements.person.devices.androidApi", { level: sdkInt })
    : t("measurements.person.devices.android", { version });
}

function getDeviceStatusPart(t: TFunction, language: string, device: MeasurementDevice): string {
  const { revocation } = device;
  if (revocation !== null) {
    const date = formatShortDate(revocation.at, language);
    return revocation.reason === null
      ? t("measurements.person.devices.revokedNoReason", { date })
      : t("measurements.person.devices.revokedWithReason", { date, reason: revocation.reason });
  }
  if (device.lastUploadAt === null) return t("measurements.contributors.noUploads");
  return t("measurements.person.devices.lastUpload", { time: formatDateTime(device.lastUploadAt, language) });
}

export function listHardwareParts(t: TFunction, language: string, device: MeasurementDevice): string[] {
  const parts = device.label === null ? [] : [measurementDeviceHardwareName(device)];
  if (device.hardware.socModel !== null) parts.push(device.hardware.socModel);
  parts.push(getDeviceStatusPart(t, language, device));
  return parts;
}

export function listAttestationParts(t: TFunction, { attestation }: MeasurementDevice): string[] {
  const parts: string[] = [];
  if (attestation.securityLevel !== null) parts.push(t(`measurements.person.devices.securityLevels.${attestation.securityLevel}`));
  if (attestation.verifiedBootState !== null) parts.push(t(`measurements.person.devices.bootStates.${attestation.verifiedBootState}`));
  if (attestation.isBootloaderLocked !== null) {
    parts.push(
      attestation.isBootloaderLocked ? t("measurements.person.devices.bootloaderLocked") : t("measurements.person.devices.bootloaderUnlocked"),
    );
  }
  return parts;
}

export function listSoftwareParts(t: TFunction, language: string, { software }: MeasurementDevice): string[] {
  if (software === null) return [];

  const parts = [getAndroidVersion(t, software.sdkInt)];
  if (software.securityPatch !== null) {
    parts.push(t("measurements.person.devices.securityPatch", { date: formatShortUtcDate(software.securityPatch, language) }));
  }
  if (software.radioVersion !== null) parts.push(t("measurements.person.devices.radioVersion", { version: software.radioVersion }));
  parts.push(t("measurements.person.devices.app", { name: software.appVersionName, code: software.appVersionCode }));
  return parts;
}

export function getDeviceWeightBasis(t: TFunction, language: string, weight: MeasurementDeviceWeight): string {
  if (weight.basis === "computed") return t("measurements.person.devices.basis.computed");
  const computed = formatWeight(weight.computed, language);
  return weight.basis === "vouch"
    ? t("measurements.person.devices.basis.vouch", { weight: computed })
    : t("measurements.person.devices.basis.device", { weight: computed });
}
