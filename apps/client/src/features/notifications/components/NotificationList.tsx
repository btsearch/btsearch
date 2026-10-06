import { Add01Icon, Cancel01Icon, DatabaseIcon, Image01Icon, Message01Icon, SignalFull02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Brand, Notification, NotificationSite, NotificationType, Operator, SubmissionAction, UserRef } from "@openbts/shared/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import { BrandMark } from "@/components/cellular/brandMark";
import { ClampedText } from "@/components/ui/clamped-text";
import { RelativeTime } from "@/components/ui/relative-time";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { brandsQueryOptions, findOperator, operatorsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { UserLink } from "@/features/user-profile/components/userLink";
import { showApiError } from "@/lib/api";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

type NotificationFact = { key: string; count?: number };
type DialogTarget = { id: number; source: StationSource };

const NOTIFICATION_VISUALS: Record<NotificationType, { icon: IconSvgElement; className: string }> = {
  submissionAccepted: { icon: Tick02Icon, className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  submissionRejected: { icon: Cancel01Icon, className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  submissionPhotoUploadFailed: { icon: Image01Icon, className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  submissionCreated: { icon: Add01Icon, className: "bg-primary/10 text-primary dark:bg-primary/15" },
  stationCellsChanged: { icon: SignalFull02Icon, className: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  stationPhotosAdded: { icon: Image01Icon, className: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  stationCommentApproved: { icon: Message01Icon, className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  officialPermitsChanged: { icon: DatabaseIcon, className: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
};

const STATION_WATCH_TYPES = new Set<NotificationType>([
  "stationCellsChanged",
  "stationPhotosAdded",
  "stationCommentApproved",
  "officialPermitsChanged",
]);

const OWN_SUBMISSION_TYPES = new Set<NotificationType>(["submissionAccepted", "submissionRejected", "submissionPhotoUploadFailed"]);

const SUBMISSION_ACTION_LABEL_KEYS: Record<SubmissionAction, string> = {
  create: "common:labels.newStation",
  update: "common:submissionType.update",
  delete: "common:submissionType.delete",
};

const OWN_SUBMISSIONS_PATH = "/account/submissions";
const ADMIN_SUBMISSIONS_PATH = "/admin/submissions";
const MAP_ZOOM = "16.00";
const MAP_COORDINATE_DECIMALS = 6;
const STATION_MAP_TARGET = "~f~S";
const OFFICIAL_SITE_MAP_TARGET = "~fu~U";

const FACT_COMPONENTS = { n: <span className="font-semibold text-foreground tabular-nums" /> };

function countFact(key: string, count: number): NotificationFact[] {
  return count > 0 ? [{ key, count }] : [];
}

function getOfficialSite(notification: Notification): NotificationSite | null {
  return notification.type === "officialPermitsChanged" ? notification.officialSite : null;
}

function getNotificationSite(notification: Notification): NotificationSite | null {
  return notification.station ?? getOfficialSite(notification);
}

function getNotificationFacts(notification: Notification): NotificationFact[] {
  switch (notification.type) {
    case "submissionCreated": {
      const action = notification.submission?.action ?? null;
      return action === null ? [] : [{ key: SUBMISSION_ACTION_LABEL_KEYS[action] }];
    }
    case "stationPhotosAdded":
    case "stationCommentApproved":
      return notification.count > 1 ? [{ key: "facts.events", count: notification.count }] : [];
    case "stationCellsChanged":
      return [
        ...countFact("facts.cellsAdded", notification.cells.added),
        ...countFact("facts.cellsRemoved", notification.cells.removed),
        ...countFact("facts.cellsUpdated", notification.cells.updated),
      ];
    case "officialPermitsChanged": {
      const facts = [
        ...countFact("facts.permitsAdded", notification.permits.added),
        ...countFact("facts.permitsDeleted", notification.permits.removed),
        ...countFact("facts.ukeStationsAdded", notification.officialSitesAdded),
      ];
      if (notification.isRemovedFromRegister) facts.push({ key: "ukeStationDeleted" });
      return facts;
    }
    default:
      return [];
  }
}

function getNotificationPerson(notification: Notification): UserRef | null {
  switch (notification.type) {
    case "submissionAccepted":
    case "submissionRejected":
      return notification.reviewer;
    case "submissionCreated":
      return notification.submitter;
    default:
      return null;
  }
}

function getReviewNote(notification: Notification): string | null {
  return notification.type === "submissionAccepted" || notification.type === "submissionRejected" ? notification.reviewNote : null;
}

function buildMapPath(location: NotificationSite["location"], target = ""): string {
  if (location === null) return `/#map=${target}`;

  const latitude = location.latitude.toFixed(MAP_COORDINATE_DECIMALS);
  const longitude = location.longitude.toFixed(MAP_COORDINATE_DECIMALS);
  return `/#map=${MAP_ZOOM}/${latitude}/${longitude}${target}`;
}

function getNotificationPath(notification: Notification): string | null {
  if (notification.type === "submissionCreated" && notification.submission !== null) return `${ADMIN_SUBMISSIONS_PATH}/${notification.submission.id}`;
  if (OWN_SUBMISSION_TYPES.has(notification.type)) return OWN_SUBMISSIONS_PATH;

  const { station } = notification;
  if (station !== null && station.id !== null) return buildMapPath(station.location, `${STATION_MAP_TARGET}${station.id}`);

  const officialSite = getOfficialSite(notification);
  if (officialSite === null) return null;
  if (officialSite.id !== null) return buildMapPath(officialSite.location, `${OFFICIAL_SITE_MAP_TARGET}${officialSite.id}`);
  return officialSite.location === null ? null : buildMapPath(officialSite.location);
}

function getDialogTarget(notification: Notification): DialogTarget | null {
  if (!STATION_WATCH_TYPES.has(notification.type)) return null;

  const stationId = notification.station?.id ?? null;
  if (stationId !== null) return { id: stationId, source: "internal" };

  const officialSiteId = getOfficialSite(notification)?.id ?? null;
  return officialSiteId === null ? null : { id: officialSiteId, source: "uke" };
}

type StationChipProps = {
  siteId: string | null;
  operator: Operator | null;
  brands?: Brand[];
};

function StationChip({ siteId, operator, brands }: StationChipProps) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-lg border bg-background pr-2 pl-1.5 text-xs font-medium">
      {operator !== null && brands !== undefined ? <BrandMark brand={getOperatorBrand(operator, brands)} size={16} /> : null}
      {operator !== null ? <span className="truncate">{operator.name}</span> : null}
      {siteId ? <span className="font-semibold tabular-nums">{siteId}</span> : null}
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
  operators?: Operator[];
  brands?: Brand[];
  onRead: (id: string) => void;
  onNavigate: () => void;
  onOpenStation?: (target: DialogTarget) => void;
};

function NotificationItem({ notification, operators, brands, onRead, onNavigate, onOpenStation }: NotificationItemProps) {
  const { t, i18n } = useTranslation("notifications");

  const { id, type, updatedAt } = notification;
  const isUnread = !notification.isRead;
  const visual = NOTIFICATION_VISUALS[type];
  const facts = getNotificationFacts(notification);
  const site = getNotificationSite(notification);
  const siteId = site?.siteId ?? null;
  const operator = findOperator(operators, site?.operatorId ?? null);
  const showStation = siteId !== null || operator !== null;
  const dialogTarget = onOpenStation === undefined ? null : getDialogTarget(notification);
  const path = getNotificationPath(notification);
  const person = getNotificationPerson(notification);
  const personLabel = person?.name || person?.username || null;
  const note = getReviewNote(notification);

  const markAsRead = () => {
    if (isUnread) onRead(id);
  };

  const activate = () => {
    markAsRead();
    onNavigate();
    if (dialogTarget !== null) onOpenStation?.(dialogTarget);
  };

  const actionClassName = cn(
    "min-w-0 flex-1 cursor-pointer text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring",
    !isUnread && "text-muted-foreground",
  );
  const actionLabel = (
    <>
      {t(`types.${type}`)}
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
          {path !== null && dialogTarget === null ? (
            <Link to={path as "/"} className={actionClassName} onClick={activate}>
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
            {showStation ? <StationChip siteId={siteId} operator={operator} brands={brands} /> : null}
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
          {personLabel !== null ? (
            <>
              <UserLink user={person} onNavigate={onNavigate} className={cn("font-medium text-foreground/80", person?.username && "relative z-10")}>
                {personLabel}
              </UserLink>
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
            </>
          ) : null}
          <time dateTime={updatedAt} title={formatFullDate(updatedAt, i18n.language)}>
            <RelativeTime date={updatedAt} />
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
  const hasOperators = notifications.some((notification) => (getNotificationSite(notification)?.operatorId ?? null) !== null);
  const { data: operators } = useQuery({ ...operatorsQueryOptions(), enabled: hasOperators });
  const { data: brands } = useQuery({ ...brandsQueryOptions(), enabled: hasOperators });

  const openStation = ({ id, source }: DialogTarget) => {
    if (source === "internal") {
      openStationDialog(id, "internal");
      return;
    }

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
          operators={operators}
          brands={brands}
          onRead={onRead}
          onNavigate={onNavigate}
          onOpenStation={isMapPage ? openStation : undefined}
        />
      ))}
    </ul>
  );
}
