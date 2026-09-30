import { Add01Icon, Cancel01Icon, DatabaseIcon, Image01Icon, Message01Icon, SignalFull02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import type { Notification, NotificationStation, NotificationType } from "../api";
import { ClampedText } from "@/components/ui/clamped-text";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { OperatorMark } from "@/features/station-details/components/dialogOperatorName";
import { showApiError } from "@/lib/api";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type NotificationFact = { key: string; count?: number };
type OpenStation = (id: number, source: NotificationStation["source"]) => void;

const NOTIFICATION_VISUALS: Record<NotificationType, { icon: IconSvgElement; className: string }> = {
  submission_approved: { icon: Tick02Icon, className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  submission_rejected: { icon: Cancel01Icon, className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  submission_photo_upload_failed: { icon: Image01Icon, className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  new_submission: { icon: Add01Icon, className: "bg-primary/10 text-primary dark:bg-primary/15" },
  station_cells_changed: { icon: SignalFull02Icon, className: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  station_photos_added: { icon: Image01Icon, className: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  station_comment_approved: { icon: Message01Icon, className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  station_uke_permit_added: { icon: DatabaseIcon, className: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
};

const STATION_WATCH_TYPES = new Set<NotificationType>([
  "station_cells_changed",
  "station_photos_added",
  "station_comment_approved",
  "station_uke_permit_added",
]);

const SUBMISSION_TYPE_LABEL_KEYS = {
  new: "common:labels.newStation",
  update: "common:submissionType.update",
  delete: "common:submissionType.delete",
} as const;

const FACT_COMPONENTS = { n: <span className="font-semibold text-foreground tabular-nums" /> };

function countFact(key: string, count: number | undefined): NotificationFact[] {
  return count !== undefined && count > 0 ? [{ key, count }] : [];
}

function getNotificationFacts({ type, changes, submission, count }: Notification): NotificationFact[] {
  if (type === "new_submission") return submission?.type ? [{ key: SUBMISSION_TYPE_LABEL_KEYS[submission.type] }] : [];
  if (type === "station_photos_added" || type === "station_comment_approved") return count > 1 ? [{ key: "facts.events", count }] : [];
  if (changes === null) return [];
  return [
    ...countFact("facts.cellsAdded", changes.cells?.added),
    ...countFact("facts.cellsRemoved", changes.cells?.removed),
    ...countFact("facts.cellsUpdated", changes.cells?.updated),
    ...countFact("facts.permitsAdded", changes.permits?.added),
    ...countFact("facts.permitsDeleted", changes.permits?.deleted),
    ...countFact("facts.ukeStationsAdded", changes.ukeStationsAdded),
    ...(changes.removedFromUke === true ? [{ key: "ukeStationDeleted" }] : []),
  ];
}

function StationChip({ station }: { station: NotificationStation }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-lg border bg-background pr-2 pl-1.5 text-xs font-medium">
      <OperatorMark mnc={station.operator?.mnc} compact />
      {station.operator ? <span className="truncate">{station.operator.name}</span> : null}
      {station.station_id ? <span className="font-semibold tabular-nums">{station.station_id}</span> : null}
    </span>
  );
}

function NotificationFacts({ facts }: { facts: NotificationFact[] }) {
  const { t } = useTranslation("notifications");

  return (
    <span className="inline-flex flex-wrap items-center text-xs text-muted-foreground">
      {facts.map((fact, index) => (
        <span key={fact.key} className="inline-flex items-center whitespace-nowrap">
          {index > 0 ? (
            <span aria-hidden="true" className="mx-1.5">
              ·
            </span>
          ) : null}
          {fact.count === undefined ? t(fact.key) : <Trans t={t} i18nKey={fact.key} count={fact.count} components={FACT_COMPONENTS} />}
        </span>
      ))}
    </span>
  );
}

type NotificationItemProps = {
  notification: Notification;
  onRead: (id: string) => void;
  onNavigate: () => void;
  onOpenStation?: OpenStation;
};

function NotificationItem({ notification, onRead, onNavigate, onOpenStation }: NotificationItemProps) {
  const { t, i18n } = useTranslation("notifications");
  const { t: tCommon } = useTranslation("common");

  const { id, type, actionUrl, updatedAt, station, actor, note } = notification;
  const isUnread = notification.readAt === null;
  const visual = NOTIFICATION_VISUALS[type];
  const facts = getNotificationFacts(notification);
  const showStation = station !== null && (station.station_id !== null || station.operator !== null);
  const dialogStationId = onOpenStation !== undefined && STATION_WATCH_TYPES.has(type) ? (station?.id ?? null) : null;

  const markAsRead = () => {
    if (isUnread) onRead(id);
  };

  const activate = () => {
    markAsRead();
    onNavigate();
    if (dialogStationId !== null) onOpenStation?.(dialogStationId, station?.source ?? "internal");
  };

  const actionClassName = cn(
    "min-w-0 flex-1 cursor-pointer text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring",
    !isUnread && "text-muted-foreground",
  );
  const actionLabel = (
    <>
      {t(`types.${type}`, { defaultValue: notification.title })}
      {isUnread ? <span className="sr-only">, {t("unread")}</span> : null}
    </>
  );

  return (
    <li className="relative flex items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted">
      <span
        aria-hidden="true"
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", visual.className, !isUnread && "opacity-70")}
      >
        <HugeiconsIcon icon={visual.icon} size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {actionUrl !== null && dialogStationId === null ? (
            <Link to={actionUrl as "/"} className={actionClassName} onClick={activate}>
              {actionLabel}
            </Link>
          ) : (
            <button type="button" className={actionClassName} onClick={activate}>
              {actionLabel}
            </button>
          )}
          {isUnread ? <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
        </div>
        {showStation || facts.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {showStation ? <StationChip station={station} /> : null}
            {facts.length > 0 ? <NotificationFacts facts={facts} /> : null}
          </div>
        ) : null}
        {note ? (
          <div className="mt-2 flex flex-col items-start rounded-md border border-border/80 px-2 py-1.5">
            <ClampedText
              text={note}
              lines={2}
              className="text-xs leading-4 text-foreground/85"
              toggleClassName="relative z-10 mt-0.5 py-0.5 text-xs"
              onExpand={markAsRead}
            />
          </div>
        ) : null}
        <p className="mt-1.5 flex flex-wrap items-center text-xs text-muted-foreground">
          {actor ? (
            <>
              <span className="font-medium text-foreground/80">{actor.name}</span>
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
            </>
          ) : null}
          <time dateTime={updatedAt} title={formatFullDate(updatedAt, i18n.language)}>
            {formatRelativeTime(updatedAt, tCommon)}
          </time>
        </p>
      </div>
    </li>
  );
}

type NotificationListProps = {
  notifications: Notification[];
  onRead: (id: string) => void;
  onNavigate: () => void;
};

export function NotificationList({ notifications, onRead, onNavigate }: NotificationListProps) {
  const isMapPage = useLocation({ select: (location) => location.pathname === "/" });
  const queryClient = useQueryClient();
  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();

  const openStation: OpenStation = (id, source) => {
    if (source === "internal") openStationDialog(id, "internal");
    else
      void queryClient
        .query({
          queryKey: ["uke-station", id],
          queryFn: () => import("@/features/station-details/api").then((module) => module.fetchUkeStation(id)),
        })
        .then(openUkePermitDialog)
        .catch(showApiError);
  };

  return (
    <ul className="flex flex-col gap-0.5">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={onRead}
          onNavigate={onNavigate}
          onOpenStation={isMapPage ? openStation : undefined}
        />
      ))}
    </ul>
  );
}
