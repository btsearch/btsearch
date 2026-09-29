import {
  Add01Icon,
  AirportTowerIcon,
  Delete02Icon,
  Globe02Icon,
  InformationCircleIcon,
  MoreHorizontalCircle01Icon,
  Notification02Icon,
  PencilEdit02Icon,
  SecurityLockIcon,
  Share08Icon,
  StarIcon,
  TaskAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import type { ListOperator, UserListSummary } from "@/features/lists/api";
import { deleteList, updateList } from "@/features/lists/api";
import { useUserLists } from "@/features/lists/hooks/useUserLists";
import { sortLists } from "@/features/lists/sortLists";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { useFavoriteLists } from "@/hooks/useFavoriteLists";
import { showApiError } from "@/lib/api";
import { getOperatorColor, getOperatorColorByName } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { UPLINK_APPEARANCE } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";

const CreateListDialog = lazy(() => import("./createListDialog").then((m) => ({ default: m.CreateListDialog })));

const LEGEND_OPERATOR_LIMIT = 4;
const SKELETON_CARD_COUNT = 4;
const LIST_GRID_CLASS_NAME = "grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3";

type EditState = { target: UserListSummary; name: string; description: string };

function getListOperatorColor(operator: ListOperator): string {
  return operator.mnc === null ? getOperatorColorByName(operator.name) : getOperatorColor(operator.mnc);
}

function ListUsage({ count, max }: { count: number; max: number }) {
  const { t } = useTranslation("lists");

  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
      <p className="text-sm font-medium text-muted-foreground tabular-nums">{t("usage", { count, max })}</p>
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: max }, (_, index) => (
          <span key={index} className={cn("h-3 w-1 rounded-[1px]", index < count ? "bg-primary" : "bg-border")} />
        ))}
      </div>
    </div>
  );
}

function OperatorMix({ operators }: { operators: ListOperator[] }) {
  const { t } = useTranslation("lists");
  const legend = operators.slice(0, LEGEND_OPERATOR_LIMIT);
  const hidden = operators.slice(LEGEND_OPERATOR_LIMIT);
  const hiddenStationCount = hidden.reduce((sum, operator) => sum + operator.count, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {legend.map((operator) => (
          <span
            key={operator.name}
            className="h-full basis-0"
            style={{ flexGrow: operator.count, backgroundColor: getListOperatorColor(operator) }}
          />
        ))}
        {hiddenStationCount > 0 ? <span className="h-full basis-0 bg-muted-foreground/30" style={{ flexGrow: hiddenStationCount }} /> : null}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {legend.map((operator) => (
          <li key={operator.name} className="flex min-w-0 items-center gap-1.5">
            <DialogOperatorName name={operator.name} mnc={operator.mnc} compact />
            <span className="text-xs text-muted-foreground tabular-nums">{operator.count}</span>
          </li>
        ))}
        {hidden.length > 0 ? (
          <li className="relative z-10">
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  />
                }
              >
                <span className="size-2.5 shrink-0 rounded-[3px] bg-muted-foreground/30" aria-hidden="true" />
                {t("otherOperators", { count: hidden.length })}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 gap-1.5 p-2">
                <ul className="space-y-1">
                  {hidden.map((operator) => (
                    <li key={operator.name} className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <DialogOperatorName name={operator.name} mnc={operator.mnc} compact />
                      <span className="text-xs text-muted-foreground tabular-nums">{operator.count}</span>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type ListCardProps = {
  list: UserListSummary;
  canFavorite: boolean;
  isFavorite: boolean;
  isNotificationsPending: boolean;
  onToggleFavorite: () => void;
  onToggleNotifications: () => void;
  onEdit: () => void;
  onShare: () => void;
  onTogglePublic: () => void;
  onDelete: () => void;
};

function ListCard({
  list,
  canFavorite,
  isFavorite,
  isNotificationsPending,
  onToggleFavorite,
  onToggleNotifications,
  onEdit,
  onShare,
  onTogglePublic,
  onDelete,
}: ListCardProps) {
  const { t, i18n } = useTranslation(["lists", "common"]);
  const { t: tCommon } = useTranslation("common");
  const favoriteLabel = isFavorite ? t("lists:removeFavorite") : t("lists:addFavorite");
  const notificationsLabel = list.notificationsEnabled ? t("lists:disableNotifications") : t("lists:enableNotifications");
  const isEmpty = list.stationCount === 0 && list.radiolineCount === 0;

  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:shadow-sm motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base leading-6 font-semibold tracking-tight">
            <Link
              to="/lists/$uuid"
              params={{ uuid: list.uuid }}
              className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {list.name}
            </Link>
          </h2>
          {list.description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{list.description}</p> : null}
        </div>
        <div className="relative z-10 -mt-1 -mr-1.5 flex shrink-0 items-center gap-0.5">
          {canFavorite ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={favoriteLabel}
              aria-pressed={isFavorite}
              title={favoriteLabel}
              className={cn(isFavorite && "text-amber-500 hover:text-amber-500 **:fill-current")}
              onClick={onToggleFavorite}
            >
              <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
            </Button>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={notificationsLabel}
                  aria-pressed={list.notificationsEnabled}
                  disabled={isNotificationsPending}
                  className={cn(list.notificationsEnabled && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
                  onClick={onToggleNotifications}
                />
              }
            >
              <HugeiconsIcon icon={Notification02Icon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <p className="font-medium">{notificationsLabel}</p>
              <p className="mt-0.5 text-background/70">{t("lists:notificationsHint")}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("lists:options")} title={t("lists:options")} />}>
              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                {t("common:actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>
                <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
                {t("common:actions.share")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTogglePublic}>
                <HugeiconsIcon icon={list.is_public ? SecurityLockIcon : Globe02Icon} strokeWidth={2} />
                {list.is_public ? t("lists:togglePrivate") : t("lists:togglePublic")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                {t("common:actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {list.operators.length > 0 ? (
        <OperatorMix operators={list.operators} />
      ) : isEmpty ? (
        <p className="text-sm text-muted-foreground">{t("lists:emptyList")}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5" />
          {t("lists:stationCount", { count: list.stationCount })}
        </span>
        {list.radiolineCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={UPLINK_APPEARANCE.microwave.icon} className="size-3.5" />
            {t("lists:radiolineCount", { count: list.radiolineCount })}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1",
            list.is_public ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={list.is_public ? Globe02Icon : SecurityLockIcon} className="size-3.5" />
          {list.is_public ? t("lists:public") : t("lists:private")}
        </span>
        <time dateTime={list.updatedAt} title={formatFullDate(list.updatedAt, i18n.language)} className="truncate text-muted-foreground">
          {tCommon("labels.updated")}: {formatRelativeTime(list.updatedAt, tCommon)}
        </time>
      </div>
    </article>
  );
}

function NewListTile({ remaining, onCreate }: { remaining: number | null; onCreate: () => void }) {
  const { t } = useTranslation("lists");
  const isFull = remaining === 0;

  return (
    <button
      type="button"
      disabled={isFull}
      onClick={onCreate}
      className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none motion-reduce:transition-none"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <HugeiconsIcon icon={isFull ? SecurityLockIcon : Add01Icon} className="size-4" />
        {isFull ? t("limitReached") : t("create")}
      </span>
      {remaining === null ? null : (
        <span className="text-xs text-muted-foreground">{isFull ? t("limitReachedHint") : t("slotsLeft", { count: remaining })}</span>
      )}
    </button>
  );
}

function ListsSkeleton() {
  return (
    <div className={LIST_GRID_CLASS_NAME} aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListsPageContent() {
  const { t } = useTranslation(["lists", "common", "nav", "stationDetails"]);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, isRefetchError, refetch } = useUserLists();
  const { canFavorite, favoriteUuids, isFavorite, toggleFavorite } = useFavoriteLists();
  const navActionTarget = useNavActionTarget();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteList,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:deleted"));
      setDeleteTarget(null);
    },
    onError: showApiError,
  });

  const togglePublicMutation = useMutation({
    mutationFn: ({ uuid, is_public }: { uuid: string; is_public: boolean }) => updateList(uuid, { is_public }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:updated"));
    },
    onError: showApiError,
  });

  const notificationsMutation = useMutation({
    mutationFn: ({ uuid, notificationsEnabled }: { uuid: string; notificationsEnabled: boolean }) => updateList(uuid, { notificationsEnabled }),
    onSuccess: (_data, { notificationsEnabled }) => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      if (notificationsEnabled) toast.success(t("lists:notificationsOnToast"), { description: t("lists:notificationsHint") });
      else toast.success(t("lists:notificationsOffToast"));
    },
    onError: showApiError,
  });

  const editMutation = useMutation({
    mutationFn: ({ uuid, name, description }: { uuid: string; name: string; description: string | null }) => updateList(uuid, { name, description }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:updated"));
      setEditOpen(false);
    },
    onError: showApiError,
  });

  const lists = useMemo(() => sortLists(data?.data ?? [], favoriteUuids), [data, favoriteUuids]);
  const maxLists = data?.maxLists ?? null;
  const listCount = data?.totalCount ?? lists.length;
  const remainingSlots = maxLists === null ? null : Math.max(0, maxLists - listCount);
  const isAtLimit = remainingSlots === 0;
  const pendingNotificationsUuid = notificationsMutation.isPending ? notificationsMutation.variables?.uuid : undefined;

  function openCreate() {
    setCreateOpen(true);
  }

  function openEdit(list: UserListSummary) {
    setEditState({ target: list, name: list.name, description: list.description ?? "" });
    setEditOpen(true);
  }

  function handleSave() {
    if (!editState || !editState.name.trim()) return;
    editMutation.mutate({
      uuid: editState.target.uuid,
      name: editState.name.trim(),
      description: editState.description.trim() || null,
    });
  }

  function handleShare(list: UserListSummary) {
    const url = `${window.location.origin}/lists/${list.uuid}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success(t("lists:copied")),
      () => toast.error(t("stationDetails:copyFailed")),
    );
  }

  return (
    <div className="w-full px-4 py-5 sm:px-6 sm:py-6">
      {navActionTarget
        ? createPortal(
            <Button onClick={openCreate} disabled={isAtLimit} title={isAtLimit ? t("lists:limitReachedHint") : undefined}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              {t("lists:create")}
            </Button>,
            navActionTarget,
          )
        : null}

      <header className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.myLists")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("lists:subtitle")}</p>
        </div>
        {maxLists === null ? null : <ListUsage count={listCount} max={maxLists} />}
      </header>

      {isRefetchError ? <StaleDataNotice className="mb-3" onRetry={() => refetch()} isRetrying={isFetching} /> : null}

      {isLoading ? (
        <ListsSkeleton />
      ) : isError && !data ? (
        <ErrorState title={t("lists:loadFailed")} onRetry={() => refetch()} isRetrying={isFetching} />
      ) : lists.length === 0 ? (
        <ErrorState
          tone="neutral"
          icon={TaskAdd01Icon}
          className="min-h-72"
          title={t("lists:emptyTitle")}
          description={t("lists:emptyDescription")}
          action={
            <Button onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              {t("lists:create")}
            </Button>
          }
        />
      ) : (
        <>
          <div className={LIST_GRID_CLASS_NAME}>
            {lists.map((list) => (
              <ListCard
                key={list.uuid}
                list={list}
                canFavorite={canFavorite}
                isFavorite={isFavorite(list.uuid)}
                isNotificationsPending={pendingNotificationsUuid === list.uuid}
                onToggleFavorite={() => toggleFavorite(list.uuid)}
                onToggleNotifications={() => notificationsMutation.mutate({ uuid: list.uuid, notificationsEnabled: !list.notificationsEnabled })}
                onEdit={() => openEdit(list)}
                onShare={() => handleShare(list)}
                onTogglePublic={() => togglePublicMutation.mutate({ uuid: list.uuid, is_public: !list.is_public })}
                onDelete={() => setDeleteTarget(list.uuid)}
              />
            ))}
            <NewListTile remaining={remainingSlots} onCreate={openCreate} />
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0" />
            {t("lists:addHint")}
          </p>
        </>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lists:editList")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-list-name">{t("lists:name")}</Label>
              <Input
                id="edit-list-name"
                value={editState?.name ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditState((prev) => (prev ? { ...prev, name: v } : prev));
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-list-description">{t("lists:description")}</Label>
              <Input
                id="edit-list-description"
                value={editState?.description ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditState((prev) => (prev ? { ...prev, description: v } : prev));
                }}
                placeholder={t("common:placeholder.optional")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!editState?.name.trim() || editMutation.isPending}>
              {editMutation.isPending ? <Spinner /> : t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lists:deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("lists:deleteConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Spinner /> : t("common:actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {createOpen ? (
        <Suspense>
          <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
        </Suspense>
      ) : null}
    </div>
  );
}
