import { Alert02Icon, AlertCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { EngineState } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatCount, formatShare } from "../utils/format";
import { EngineCardFooter, EngineFact, EngineFacts } from "./engineCardParts";
import { formatElapsed } from "./engineRuns";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  CARD_FOOTER_LINK_CLASS,
  CardFooterLinkIcon,
  CardNotice,
  DashboardCard,
  SystemSettingsLink,
} from "@/features/admin/dashboard/cards/dashboardCard";
import { WARNING_TEXT_CLASS } from "@/features/admin/settings/components/classNames";
import { getUploadStatusLabel } from "@/features/settings/components/measurements/uploadStatus";
import { StatusBadge, UsageMeter } from "@/features/settings/components/settingsPrimitives";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const ENGINE_SILENT_MS = 2 * 60_000;
const QUEUE_LATE_MS = 30 * 60_000;
const REJECTED_WARNING_SHARE = 0.1;
const STORED_WARNING_SHARE = 0.9;
const DISK_WARNING_SHARE = 0.85;

export function EngineStatusCard({ instances, now }: { instances: EngineState["instances"]; now: number }) {
  const { t, i18n } = useTranslation("admin");
  const latest = instances[0];
  const title = t("measurements.engine.status.title");

  if (latest === undefined) {
    return (
      <DashboardCard title={title}>
        <CardNotice title={t("measurements.engine.status.noInstance")} />
      </DashboardCard>
    );
  }

  const isSilent = now - Date.parse(latest.seenAt) > ENGINE_SILENT_MS;

  return (
    <DashboardCard
      title={title}
      headEnd={
        isSilent ? (
          <StatusBadge tone="destructive" icon={AlertCircleIcon}>
            {t("measurements.engine.status.silent")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" icon={Tick02Icon}>
            {t("measurements.engine.status.running")}
          </StatusBadge>
        )
      }
      footer={isSilent ? <EngineCardFooter note={t("measurements.engine.status.silentNote")} /> : null}
    >
      <EngineFacts>
        <EngineFact label={t("measurements.engine.status.lastSeen")} valueClassName={isSilent ? "text-destructive" : undefined}>
          <RelativeTime date={latest.seenAt} />
        </EngineFact>
        <EngineFact label={t("measurements.engine.status.startedAt")}>{formatDateTime(latest.startedAt, i18n.language)}</EngineFact>
        <EngineFact label={t("measurements.engine.status.instance")} valueClassName="font-mono text-[13px] font-medium">
          {latest.instance}
        </EngineFact>
      </EngineFacts>
    </DashboardCard>
  );
}

export function QueueCard({ state, now }: { state: EngineState; now: number }) {
  const { t, i18n } = useTranslation("admin");
  const { waiting, oldestWaitingAt, subtractionsWaiting } = state.uploads;
  const waitedMs = oldestWaitingAt === null ? null : now - Date.parse(oldestWaitingAt);
  const isLate = waitedMs !== null && waitedMs > QUEUE_LATE_MS;

  return (
    <DashboardCard
      title={t("measurements.engine.queue.title")}
      headEnd={
        isLate ? (
          <StatusBadge tone="warning" icon={Alert02Icon}>
            {t("measurements.engine.queue.late")}
          </StatusBadge>
        ) : null
      }
      footer={isLate ? <EngineCardFooter note={t("measurements.engine.queue.lateNote")} /> : null}
    >
      <EngineFacts>
        <EngineFact label={t("measurements.engine.queue.waiting")}>{formatCount(waiting, i18n.language)}</EngineFact>
        <EngineFact label={t("measurements.engine.queue.oldestWaiting")} valueClassName={isLate ? WARNING_TEXT_CLASS : undefined}>
          {waitedMs === null ? "-" : formatElapsed(t, waitedMs)}
        </EngineFact>
        <EngineFact label={t("measurements.engine.queue.subtractions")}>{formatCount(subtractionsWaiting, i18n.language)}</EngineFact>
        <EngineFact label={t("measurements.engine.queue.sites")}>{formatCount(state.sitesWaiting, i18n.language)}</EngineFact>
      </EngineFacts>
    </DashboardCard>
  );
}

export function LastDayCard({ uploads }: { uploads: EngineState["uploads"] }) {
  const { t, i18n } = useTranslation(["admin", "settings", "common"]);
  const { processedLastDay, rejectedLastDay } = uploads;
  const endedLastDay = processedLastDay + rejectedLastDay;
  const rejectedShare = endedLastDay === 0 ? 0 : rejectedLastDay / endedLastDay;
  const isRejectingMany = rejectedShare >= REJECTED_WARNING_SHARE;

  return (
    <DashboardCard
      title={t("measurements.engine.lastDay.title")}
      footer={
        <EngineCardFooter note={t("measurements.engine.lastDay.note")}>
          <Link to="/admin/measurements/uploads" search={{ statuses: "rejected" }} className={CARD_FOOTER_LINK_CLASS}>
            {t("measurements.engine.lastDay.showRejected")}
            <CardFooterLinkIcon />
          </Link>
        </EngineCardFooter>
      }
    >
      <EngineFacts>
        <EngineFact label={getUploadStatusLabel(t, "processed")}>{formatCount(processedLastDay, i18n.language)}</EngineFact>
        <EngineFact label={getUploadStatusLabel(t, "rejected")} valueClassName={isRejectingMany ? WARNING_TEXT_CLASS : undefined}>
          {formatCount(rejectedLastDay, i18n.language)}
          {endedLastDay === 0 ? null : (
            <span className={cn("ml-1 font-normal", isRejectingMany ? null : "text-muted-foreground")}>
              {t("measurements.engine.lastDay.rejectedShare", { share: formatShare(rejectedShare, i18n.language) })}
            </span>
          )}
        </EngineFact>
      </EngineFacts>
    </DashboardCard>
  );
}

export function StorageCard({ state }: { state: EngineState }) {
  const { t } = useTranslation("admin");
  const { storedBytes, budgetBytes, disk } = state.storage;
  const isFull = budgetBytes > 0 && storedBytes >= budgetBytes;

  return (
    <DashboardCard
      title={t("measurements.engine.storage.title")}
      headEnd={
        isFull ? (
          <StatusBadge tone="destructive" icon={AlertCircleIcon}>
            {t("measurements.engine.storage.full")}
          </StatusBadge>
        ) : null
      }
      footer={
        <EngineCardFooter note={isFull ? t("measurements.engine.storage.fullNote") : t("measurements.engine.storage.note")}>
          <SystemSettingsLink />
        </EngineCardFooter>
      }
    >
      <div className="flex flex-col gap-3.5 px-4 pt-3 pb-1.5">
        <UsageMeter
          label={t("measurements.engine.storage.stored")}
          usage={{ used: storedBytes, max: budgetBytes }}
          format={formatFileSize}
          warnAbove={STORED_WARNING_SHARE}
        />
        {disk === null ? null : (
          <UsageMeter
            label={t("measurements.engine.storage.disk")}
            usage={{ used: disk.totalBytes - disk.freeBytes, max: disk.totalBytes }}
            format={formatFileSize}
            warnAbove={DISK_WARNING_SHARE}
          />
        )}
      </div>
      <EngineFacts className="pt-0.5 pb-2">
        <EngineFact label={t("measurements.engine.storage.database")}>{formatFileSize(state.databaseBytes)}</EngineFact>
      </EngineFacts>
    </DashboardCard>
  );
}
