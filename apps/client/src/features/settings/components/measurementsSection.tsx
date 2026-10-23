import { ArrowUpRight01Icon, InformationCircleIcon, LegalDocument01Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementDevice, MeasurementDeviceTier, MeasurementTerms } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import {
  acceptMeasurementTerms,
  measurementDeviceHardwareName,
  measurementDeviceName,
  measurementDevicesQueryOptions,
  measurementTermsQueryOptions,
  measurementUploadsLimitQueryOptions,
  revokeMeasurementDevice,
} from "../measurementQueries";
import { SETTINGS_SECTION_IDS } from "../sections";
import { ConfirmDialog } from "./confirmDialog";
import type { SettingsUser } from "./identityBanner";
import { MeasurementUploadsCard } from "./measurementUploadsCard";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SETTINGS_TWO_COLUMN_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsCardNote,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  SettingsSection,
  SettingsStack,
  StatusBadge,
  UsageMeter,
} from "./settingsPrimitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRelativeTime } from "@/components/ui/relative-time";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/useSettings";
import { getDateFormatter } from "@/lib/dateFormat";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONTRIBUTOR_TERMS_PATH = "/terms";

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

function DeviceRow({ device, formatDate, onRevoke }: { device: MeasurementDevice; formatDate: (value: string) => string; onRevoke: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const { tier } = device.attestation;

  return (
    <SettingsRow
      icon={SmartPhone01Icon}
      title={measurementDeviceName(device)}
      badge={
        device.isRevoked ? (
          <StatusBadge tone="muted">{t("measurements.devices.revoked")}</StatusBadge>
        ) : (
          <StatusBadge tone={DEVICE_TIER_TONES[tier]}>{t(`measurements.devices.tiers.${tier}`)}</StatusBadge>
        )
      }
      description={
        <>
          <SettingsMeta>
            {device.label !== null ? <SettingsMetaItem>{measurementDeviceHardwareName(device)}</SettingsMetaItem> : null}
            {device.revokedAt !== null ? (
              <SettingsMetaItem>{t("measurements.devices.revokedOn", { date: formatDate(device.revokedAt) })}</SettingsMetaItem>
            ) : null}
            {device.isRevoked ? null : (
              <>
                <SettingsMetaItem>
                  {device.lastUploadAt !== null ? <DeviceLastUpload date={device.lastUploadAt} /> : t("measurements.devices.noUploads")}
                </SettingsMetaItem>
                <SettingsMetaItem>{t("security.passkeys.addedOn", { date: formatDate(device.createdAt) })}</SettingsMetaItem>
              </>
            )}
          </SettingsMeta>
          {device.revocationReason !== null ? <span className="block">{t("measurements.reason", { reason: device.revocationReason })}</span> : null}
        </>
      }
    >
      {device.isRevoked ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
          onClick={onRevoke}
        >
          {t("common:actions.revoke")}
        </Button>
      )}
    </SettingsRow>
  );
}

function DevicesCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
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

  const dateFormatter = getDateFormatter(i18n.language);
  const formatDate = (value: string) => dateFormatter.format(new Date(value));
  const orderedDevices = [...(devices ?? [])].sort((left, right) => Number(left.isRevoked) - Number(right.isRevoked));

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
          orderedDevices.map((device) => (
            <DeviceRow key={device.id} device={device} formatDate={formatDate} onRevoke={() => setRevokeTarget(device)} />
          ))
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

function UploadLimitCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation("settings");
  const { data: limit, isPending, isFetching, refetch } = useQuery(measurementUploadsLimitQueryOptions(userId));

  if (limit === null) return null;

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.limit.title")} description={t("measurements.limit.description")} />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : limit === undefined ? (
          <SettingsRowError title={t("measurements.limit.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          <div className="flex min-w-0 gap-4 px-4 py-3.5 sm:px-5">
            <UsageMeter
              label={t("measurements.limit.uploads")}
              usage={{ used: limit.uploads.limit - limit.uploads.remaining, max: limit.uploads.limit }}
              format={String}
            />
            <UsageMeter
              label={t("measurements.limit.bytes")}
              usage={{ used: limit.bytes.limit - limit.bytes.remaining, max: limit.bytes.limit }}
              format={formatFileSize}
            />
          </div>
        )}
      </div>
      {limit !== undefined && limit.resetsAt !== null ? (
        <SettingsCardNote>
          {t("measurements.limit.resetsAt", { time: new Date(limit.resetsAt).toLocaleTimeString(i18n.language, { timeStyle: "short" }) })}
        </SettingsCardNote>
      ) : null}
    </SettingsCard>
  );
}

function TermsCard({ userId, terms, canAccept }: { userId: string; terms: MeasurementTerms; canAccept: boolean }) {
  const { t, i18n } = useTranslation("settings");
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => acceptMeasurementTerms(terms.currentVersion),
    onSuccess: () => {
      toast.success(t("measurements.terms.acceptSuccess"));
      void queryClient.invalidateQueries({ queryKey: measurementTermsQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const isOutdated = terms.acceptedVersion !== terms.currentVersion;
  const acceptedOn =
    terms.acceptedAt === null
      ? null
      : t("measurements.terms.acceptedOn", { date: getDateFormatter(i18n.language).format(new Date(terms.acceptedAt)) });

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.terms.title")} />
      <div className="border-t">
        <SettingsRow
          wrap={isOutdated}
          icon={LegalDocument01Icon}
          title={t("measurements.terms.version", { version: terms.acceptedVersion })}
          badge={
            isOutdated ? (
              <StatusBadge tone="warning">{t("measurements.terms.newVersion", { version: terms.currentVersion })}</StatusBadge>
            ) : (
              <StatusBadge tone="success">{t("measurements.terms.accepted")}</StatusBadge>
            )
          }
          description={
            isOutdated ? (
              <>
                {acceptedOn !== null ? <span className="block">{acceptedOn}</span> : null}
                {canAccept ? <span className="block">{t("measurements.terms.acceptHint")}</span> : null}
              </>
            ) : (
              acceptedOn
            )
          }
        >
          <Link to={CONTRIBUTOR_TERMS_PATH} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("measurements.terms.read")}
          </Link>
          {isOutdated && canAccept ? (
            <Button type="button" size="sm" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate()}>
              {acceptMutation.isPending ? <Spinner /> : null}
              {t("measurements.terms.accept", { version: terms.currentVersion })}
            </Button>
          ) : null}
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}

export function MeasurementsSection({ user, terms }: { user: SettingsUser; terms: MeasurementTerms }) {
  const { t } = useTranslation("settings");
  const { data: settings } = useSettings();
  const isUploadingOff = settings?.features.measurementUploads === false;

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.measurements} title={t("sections.measurements")}>
      {isUploadingOff ? (
        <p className={cn("mb-4 flex items-center gap-2", SETTINGS_DESCRIPTION_CLASS)}>
          <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
          {t("measurements.uploadsOff")}
        </p>
      ) : null}
      <SettingsStack>
        <div className={SETTINGS_TWO_COLUMN_CLASS}>
          <DevicesCard userId={user.id} />
          <SettingsStack>
            <UploadLimitCard userId={user.id} />
            <TermsCard userId={user.id} terms={terms} canAccept={!isUploadingOff} />
          </SettingsStack>
        </div>
        <MeasurementUploadsCard userId={user.id} />
      </SettingsStack>
    </SettingsSection>
  );
}
