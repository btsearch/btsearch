import {
  Add01Icon,
  Cancel01Icon,
  DatabaseIcon,
  Image01Icon,
  Message01Icon,
  Notification01Icon,
  Notification02Icon,
  SignalFull02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/authClient";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Notification } from "../api";
import { useNotifications } from "../useNotifications";
import { usePushSubscription } from "../usePushSubscription";

type NotificationMetadata = {
  added?: number;
  count?: number;
  permits_added?: number;
  permits_updated?: number;
  reviewer_name?: string;
  reviewer_note?: string;
  station_id?: string;
  station_operator_name?: string;
  submitter_name?: string;
  uke_stations_added?: number;
  removed?: number;
  updated?: number;
};

function formatStationLabel(stationId: string | undefined, operatorName: string | undefined): string | undefined {
  if (stationId === undefined) return undefined;
  return operatorName !== undefined ? `${stationId} (${operatorName})` : stationId;
}

function getNotificationVisual(type: Notification["type"]) {
  switch (type) {
    case "submission_approved":
      return { icon: Tick02Icon, iconClassName: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
    case "submission_rejected":
      return { icon: Cancel01Icon, iconClassName: "bg-destructive/10 text-destructive dark:bg-destructive/20" };
    case "new_submission":
      return { icon: Add01Icon, iconClassName: "bg-primary/10 text-primary dark:bg-primary/15" };
    case "station_cells_changed":
      return { icon: SignalFull02Icon, iconClassName: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" };
    case "station_photos_added":
      return { icon: Image01Icon, iconClassName: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" };
    case "station_comment_approved":
      return { icon: Message01Icon, iconClassName: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
    case "station_uke_permit_added":
      return { icon: DatabaseIcon, iconClassName: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" };
  }
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const { t } = useTranslation("notifications");
  const { t: tCommon } = useTranslation("common");
  const { icon, iconClassName } = getNotificationVisual(notification.type);
  const metadata = notification.metadata as unknown as NotificationMetadata | null;
  const stationId = metadata?.station_id;
  const stationOperatorName = metadata?.station_operator_name;
  const stationLabel = formatStationLabel(stationId, stationOperatorName);
  const reviewerNote = metadata?.reviewer_note;
  const reviewerName = metadata?.reviewer_name;
  const submitterName = metadata?.submitter_name;
  const cellsAdded = metadata?.added;
  const cellsRemoved = metadata?.removed;
  const cellsUpdated = metadata?.updated;
  const permitsAdded = metadata?.permits_added;
  const permitsUpdated = metadata?.permits_updated;
  const ukeStationsAdded = metadata?.uke_stations_added;
  const count = metadata?.count;
  const updatedAt = notification.updatedAt ?? notification.createdAt;

  const handleRead = () => {
    if (!notification.readAt) onRead(notification.id);
  };

  const content = (
    <>
      <span
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", iconClassName, notification.readAt ? "opacity-70" : "")}
      >
        <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium truncate", notification.readAt ? "text-muted-foreground" : "")}>{notification.title}</p>
        {submitterName && <p className="text-xs text-muted-foreground truncate">{t("submittedBy", { name: submitterName })}</p>}
        {stationLabel && <p className="text-xs text-muted-foreground truncate">{t("station", { stationId: stationLabel })}</p>}
        {reviewerName && <p className="text-xs text-muted-foreground truncate">{t("reviewerName", { name: reviewerName })}</p>}
        {reviewerNote && <p className="text-xs text-muted-foreground truncate italic">{reviewerNote}</p>}
        {cellsAdded !== undefined && cellsAdded > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("cellsAdded", { count: cellsAdded })}</p>
        ) : null}
        {cellsRemoved !== undefined && cellsRemoved > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("cellsRemoved", { count: cellsRemoved })}</p>
        ) : null}
        {cellsUpdated !== undefined && cellsUpdated > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("cellsUpdated", { count: cellsUpdated })}</p>
        ) : null}
        {permitsAdded !== undefined && permitsAdded > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("permitsAdded", { count: permitsAdded })}</p>
        ) : null}
        {permitsUpdated !== undefined && permitsUpdated > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("permitsUpdated", { count: permitsUpdated })}</p>
        ) : null}
        {ukeStationsAdded !== undefined && ukeStationsAdded > 0 ? (
          <p className="text-xs text-muted-foreground truncate">{t("ukeStationsAdded", { count: ukeStationsAdded })}</p>
        ) : null}
        {count !== undefined && count > 1 ? <p className="text-xs text-muted-foreground truncate">{t("eventCount", { count })}</p> : null}
        <p className="text-xs text-muted-foreground">{formatRelativeTime(updatedAt, tCommon)}</p>
      </div>
    </>
  );

  if (notification.actionUrl) {
    return (
      <DropdownMenuItem render={<Link to={notification.actionUrl as "/"} />} className="flex items-start gap-2 py-2" onClick={handleRead}>
        {content}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem className="flex items-start gap-2 py-2" onClick={handleRead}>
      {content}
    </DropdownMenuItem>
  );
}

export function NotificationsBell({ className }: { className?: string } = {}) {
  const { t } = useTranslation("notifications");
  const { data: session } = authClient.useSession();
  const { notifications, totalUnread, markAllRead, markRead } = useNotifications();
  const { subscription, permission, isSubscribing, subscribe, isSupported } = usePushSubscription();

  if (!session?.user) return null;

  const visibleNotifications = notifications.slice(0, 10);
  const hasUnread = totalUnread > 0;
  const showPushPrompt = isSupported && !subscription && permission !== "denied";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
            aria-label={t("title")}
          />
        }
      >
        <HugeiconsIcon icon={Notification01Icon} size={18} />
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1.5">
          <p className="text-sm font-semibold">{t("title")}</p>
          {hasUnread && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                markAllRead();
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>

        <DropdownMenuSeparator />

        {showPushPrompt && (
          <>
            <button
              type="button"
              disabled={isSubscribing}
              onClick={() => void subscribe()}
              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <HugeiconsIcon icon={Notification02Icon} size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{isSubscribing ? t("enabling") : t("enablePush")}</p>
                <p className="text-xs text-muted-foreground">{t("pushDescription")}</p>
              </div>
            </button>
            {visibleNotifications.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {visibleNotifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
        ) : (
          visibleNotifications.map((n) => <NotificationItem key={n.id} notification={n} onRead={markRead} />)
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
