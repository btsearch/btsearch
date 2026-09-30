import { ArrowDown01Icon, Notification01Icon, Notification02Icon, TickDouble02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIsFetching } from "@tanstack/react-query";
import { type RefObject, Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

import { NOTIFICATIONS_PAGE_SIZE, useNotifications } from "../useNotifications";
import { usePushSubscription } from "../usePushSubscription";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const SKELETON_TITLE_WIDTHS = ["58%", "74%", "46%"];

const loadNotificationList = () => import("./NotificationList");
const NotificationList = lazy(() => loadNotificationList().then((module) => ({ default: module.NotificationList })));

function preloadNotificationList() {
  void loadNotificationList();
}

function NotificationsLoadError({ onRetry }: { onRetry: () => unknown }) {
  const isFetching = useIsFetching({ queryKey: ["notifications"] }) > 0;

  return <InlineError size="sm" onRetry={onRetry} isRetrying={isFetching} />;
}

function NotificationsSkeleton() {
  const { t } = useTranslation("common");

  return (
    <div role="status" aria-label={t("actions.loading")} className="flex flex-col gap-0.5">
      {SKELETON_TITLE_WIDTHS.map((width) => (
        <div key={width} className="flex items-start gap-2.5 px-2 py-2.5">
          <Skeleton className="mt-0.5 size-7 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
            <Skeleton className="h-3" style={{ width }} />
            <Skeleton className="h-5.5 w-28 rounded-lg" />
            <Skeleton className="h-2.5 w-18" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationsEmpty() {
  const { t } = useTranslation("notifications");

  return (
    <div className="flex flex-col items-center px-6 pt-7 pb-8 text-center">
      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={Notification01Icon} size={18} />
      </span>
      <p className="mt-3 text-sm font-semibold">{t("empty")}</p>
      <p className="mt-1 max-w-70 text-xs leading-4.5 text-muted-foreground">{t("emptyDescription")}</p>
    </div>
  );
}

function PushPrompt({ isSubscribing, onEnable }: { isSubscribing: boolean; onEnable: () => void }) {
  const { t } = useTranslation("notifications");

  return (
    <div className="mb-0.5 flex items-center gap-2.5 rounded-lg bg-primary/8 p-2.5">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <HugeiconsIcon icon={Notification02Icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] leading-4.5 font-semibold">{t("pushTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("pushDescription")}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary dark:hover:bg-primary/25"
        disabled={isSubscribing}
        onClick={onEnable}
      >
        {isSubscribing ? t("enabling") : t("pushEnable")}
      </Button>
    </div>
  );
}

type NotificationsBellProps = {
  className?: string;
  side?: "top" | "bottom";
  anchor?: RefObject<HTMLElement | null>;
};

export function NotificationsBell({ className, side = "bottom", anchor }: NotificationsBellProps) {
  const { t } = useTranslation("notifications");
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(NOTIFICATIONS_PAGE_SIZE);
  const { notifications, totalUnread, hasMore, reachedEnd, nextLimit, isLoading, isLoadingMore, isLoadingError, refetch, markAllRead, markRead } =
    useNotifications(limit);
  const { subscription, permission, isSubscribing, subscribe, isSupported } = usePushSubscription();

  if (!session?.user) return null;

  const hasUnread = totalUnread > 0;
  const showPushPrompt = isSupported && !subscription && permission !== "denied";
  const showAllLoaded = limit > NOTIFICATIONS_PAGE_SIZE && reachedEnd;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setLimit(NOTIFICATIONS_PAGE_SIZE);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative cursor-pointer", className)}
            aria-label={hasUnread ? t("triggerUnread", { count: totalUnread }) : t("title")}
            onPointerEnter={preloadNotificationList}
            onFocus={preloadNotificationList}
          />
        }
      >
        <HugeiconsIcon icon={Notification01Icon} size={18} />
        {hasUnread ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white"
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={anchor ? "center" : "end"}
        sideOffset={anchor ? 8 : 4}
        anchor={anchor}
        collisionPadding={8}
        className="max-h-[min(37.5rem,var(--available-height))] w-96 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
          <PopoverTitle className="text-sm font-semibold">{t("title")}</PopoverTitle>
          {hasUnread ? (
            <>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/15 px-1.5 text-[11px] font-bold text-primary tabular-nums">
                {totalUnread}
              </span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto cursor-pointer text-muted-foreground" onClick={markAllRead}>
                <HugeiconsIcon icon={TickDouble02Icon} data-icon="inline-start" />
                {t("markAllRead")}
              </Button>
            </>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin">
          {showPushPrompt ? <PushPrompt isSubscribing={isSubscribing} onEnable={() => void subscribe()} /> : null}
          {isLoadingError ? (
            <NotificationsLoadError onRetry={() => refetch()} />
          ) : isLoading ? (
            <NotificationsSkeleton />
          ) : notifications.length === 0 ? (
            <NotificationsEmpty />
          ) : (
            <>
              <Suspense fallback={<NotificationsSkeleton />}>
                <NotificationList notifications={notifications} onRead={markRead} onNavigate={() => handleOpenChange(false)} />
              </Suspense>
              {hasMore ? (
                <div className="-mx-1 mt-0.5 border-t px-1 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full cursor-pointer text-muted-foreground"
                    disabled={isLoadingMore}
                    onClick={() => setLimit(nextLimit)}
                  >
                    {isLoadingMore ? <Spinner className="size-3.5" /> : null}
                    {t("loadOlder")}
                    {isLoadingMore ? null : <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" />}
                  </Button>
                </div>
              ) : showAllLoaded ? (
                <p className="py-2.5 text-center text-xs text-muted-foreground">{t("allLoaded")}</p>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
