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
import type { Brand, ListOperatorCount, Operator } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, lazy, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
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
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  type OwnList,
  deleteList,
  listKeys,
  listLimitQueryOptions,
  ownListsQueryOptions,
  updateList,
} from "@/features/lists/api";
import { sortFavoriteListsFirst } from "@/features/lists/sortLists";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { FALLBACK_BRAND_COLOR, getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { useFavoriteLists } from "@/hooks/useFavoriteLists";
import { isConflict, showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatFullDate } from "@/lib/format";
import { UPLINK_APPEARANCE } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";

const CreateListDialog = lazy(() => import("./createListDialog").then((m) => ({ default: m.CreateListDialog })));

type EditState = { listId: string; name: string; description: string; takenName: string | null };
type OperatorLook = { name: string; mark: BrandLook };
type OperatorLooks = ReadonlyMap<number, OperatorLook>;
type LegendOperator = { operatorId: number; name: string; count: number; mark: BrandLook };

const LEGEND_OPERATOR_LIMIT = 4;
const SKELETON_CARD_COUNT = 4;
const LIST_GRID_CLASS_NAME = "grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3";
const UNKNOWN_OPERATOR_MARK: BrandLook = { color: FALLBACK_BRAND_COLOR, logo: null };

function indexOperatorLooks(operators: readonly Operator[], brands: readonly Brand[]): OperatorLooks {
  return new Map(
    operators.map((operator): [number, OperatorLook] => {
      const brand = getOperatorBrand(operator, brands);
      return [operator.id, { name: operator.name, mark: { color: getBrandColor(brand), logo: brand?.logo ?? null } }];
    }),
  );
}

function compareLegendOperators(left: LegendOperator, right: LegendOperator): number {
  return right.count - left.count || left.name.localeCompare(right.name) || left.operatorId - right.operatorId;
}

function listLegendOperators(operatorCounts: readonly ListOperatorCount[], operatorLooks: OperatorLooks, unknownName: string): LegendOperator[] {
  const legendOperators = operatorCounts.map(({ operatorId, count }): LegendOperator => {
    const look = operatorLooks.get(operatorId);
    return { operatorId, count, name: look?.name ?? unknownName, mark: look?.mark ?? UNKNOWN_OPERATOR_MARK };
  });
  return legendOperators.sort(compareLegendOperators);
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

function LegendOperatorName({ operator }: { operator: LegendOperator }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BrandMark brand={operator.mark} />
      <span className="min-w-0 truncate text-xs font-medium text-foreground">{operator.name}</span>
    </span>
  );
}

function OperatorMix({ operators }: { operators: LegendOperator[] }) {
  const { t } = useTranslation("lists");
  const legend = operators.slice(0, LEGEND_OPERATOR_LIMIT);
  const hidden = operators.slice(LEGEND_OPERATOR_LIMIT);
  const hiddenStationCount = hidden.reduce((sum, operator) => sum + operator.count, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {legend.map((operator) => (
          <span key={operator.operatorId} className="h-full basis-0" style={{ flexGrow: operator.count, backgroundColor: operator.mark.color }} />
        ))}
        {hiddenStationCount > 0 ? <span className="h-full basis-0 bg-muted-foreground/30" style={{ flexGrow: hiddenStationCount }} /> : null}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {legend.map((operator) => (
          <li key={operator.operatorId} className="flex min-w-0 items-center gap-1.5">
            <LegendOperatorName operator={operator} />
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
                    <li key={operator.operatorId} className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <LegendOperatorName operator={operator} />
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
  list: OwnList;
  operatorLooks: OperatorLooks | null;
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
  operatorLooks,
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
  const { t, i18n } = useTranslation(["lists", "common", "main"]);
  const { t: tCommon } = useTranslation("common");
  const isNotified = list.notificationsEnabled === true;
  const favoriteLabel = isFavorite ? t("lists:removeFavorite") : t("lists:addFavorite");
  const notificationsLabel = isNotified ? t("lists:disableNotifications") : t("lists:enableNotifications");
  const stationCount = list.itemCounts.stations + list.itemCounts.officialSites;
  const radiolineCount = list.itemCounts.microwaveLinks;
  const isEmpty = stationCount === 0 && radiolineCount === 0;
  const legendOperators = operatorLooks === null ? [] : listLegendOperators(list.operatorCounts, operatorLooks, t("main:unknownOperator"));
  const hasLegend = legendOperators.length > 0;

  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:shadow-sm motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base leading-6 font-semibold tracking-tight">
            <Link
              to="/lists/$uuid"
              params={{ uuid: list.id }}
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
                  aria-pressed={isNotified}
                  disabled={isNotificationsPending}
                  className={cn(isNotified && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
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
                <HugeiconsIcon icon={list.isPublic ? SecurityLockIcon : Globe02Icon} strokeWidth={2} />
                {list.isPublic ? t("lists:togglePrivate") : t("lists:togglePublic")}
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

      {hasLegend ? <OperatorMix operators={legendOperators} /> : null}
      {!hasLegend && isEmpty ? <p className="text-sm text-muted-foreground">{t("lists:emptyList")}</p> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5" />
          {t("common:labels.stations", { count: stationCount })}
        </span>
        {radiolineCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={UPLINK_APPEARANCE.microwave.icon} className="size-3.5" />
            {t("lists:radiolineCount", { count: radiolineCount })}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1",
            list.isPublic ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={list.isPublic ? Globe02Icon : SecurityLockIcon} className="size-3.5" />
          {list.isPublic ? t("lists:public") : t("lists:private")}
        </span>
        <time dateTime={list.updatedAt} title={formatFullDate(list.updatedAt, i18n.language)} className="truncate text-muted-foreground">
          {tCommon("labels.updated")}: <RelativeTime date={list.updatedAt} />
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

export function ListsPageContent({ userId }: { userId: string }) {
  const { t } = useTranslation(["lists", "common", "nav", "stationDetails"]);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, isRefetchError, refetch } = useQuery(ownListsQueryOptions());
  const { data: listLimit } = useQuery(listLimitQueryOptions(userId));
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());
  const { canFavorite, favoriteUuids, isFavorite, toggleFavorite } = useFavoriteLists();
  const navActionTarget = useNavActionTarget();
  const [createOpen, setCreateOpen] = useState(false);
  const [createOpenCount, setCreateOpenCount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteList,
    onSuccess: (_result, listId) => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      queryClient.removeQueries({ queryKey: listKeys.list(listId) });
      toast.success(t("lists:deleted"));
      setDeleteTarget(null);
    },
    onError: showApiError,
  });

  const togglePublicMutation = useMutation({
    mutationFn: ({ listId, isPublic }: { listId: string; isPublic: boolean }) => updateList(listId, { isPublic }),
    onSuccess: (_list, { listId }) => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      void queryClient.invalidateQueries({ queryKey: listKeys.list(listId) });
      toast.success(t("lists:updated"));
    },
    onError: showApiError,
  });

  const notificationsMutation = useMutation({
    mutationFn: ({ listId, notificationsEnabled }: { listId: string; notificationsEnabled: boolean }) => updateList(listId, { notificationsEnabled }),
    onSuccess: (_list, { notificationsEnabled }) => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      if (notificationsEnabled) toast.success(t("lists:notificationsOnToast"), { description: t("lists:notificationsHint") });
      else toast.success(t("lists:notificationsOffToast"));
    },
    onError: showApiError,
  });

  const editMutation = useMutation({
    mutationFn: ({ listId, name, description }: { listId: string; name: string; description: string | null }) =>
      updateList(listId, { name, description }),
    onSuccess: (_list, { listId }) => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      void queryClient.invalidateQueries({ queryKey: listKeys.list(listId) });
      toast.success(t("lists:updated"));
      setEditOpen(false);
    },
    onError: (error, { listId, name }) => {
      if (!isConflict(error)) {
        showApiError(error);
        return;
      }
      setEditState((current) => (current?.listId === listId ? { ...current, takenName: name } : current));
    },
  });

  const lists = sortFavoriteListsFirst(data?.lists ?? [], favoriteUuids, (list) => list.id);
  const maxLists = data === undefined || listLimit === undefined ? null : listLimit;
  const listCount = data?.total ?? lists.length;
  const remainingSlots = maxLists === null ? null : Math.max(0, maxLists - listCount);
  const isAtLimit = remainingSlots === 0;
  const pendingNotificationsListId = notificationsMutation.isPending ? notificationsMutation.variables?.listId : undefined;
  const operatorLooks = operators === undefined || brands === undefined ? null : indexOperatorLooks(operators, brands);
  const trimmedEditName = editState?.name.trim() ?? "";
  const isEditNameTaken = editState?.takenName === trimmedEditName;

  function openCreate() {
    setCreateOpenCount((count) => count + 1);
    setCreateOpen(true);
  }

  function openEdit(list: OwnList) {
    setEditState({ listId: list.id, name: list.name, description: list.description ?? "", takenName: null });
    setEditOpen(true);
  }

  function handleSave() {
    if (!editOpen || !editState || !trimmedEditName || isEditNameTaken || editMutation.isPending) return;
    editMutation.mutate({
      listId: editState.listId,
      name: trimmedEditName,
      description: editState.description.trim() || null,
    });
  }

  function handleShare(list: OwnList) {
    const url = `${window.location.origin}/lists/${list.id}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success(t("common:actions.linkCopied")),
      () => toast.error(t("stationDetails:copyFailed")),
    );
  }

  let body: ReactNode;
  if (isLoading) {
    body = <ListsSkeleton />;
  } else if (isError && !data) {
    body = <ErrorState title={t("lists:loadFailed")} onRetry={() => refetch()} isRetrying={isFetching} />;
  } else if (lists.length === 0) {
    body = (
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
    );
  } else {
    body = (
      <>
        <div className={LIST_GRID_CLASS_NAME}>
          {lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              operatorLooks={operatorLooks}
              canFavorite={canFavorite}
              isFavorite={isFavorite(list.id)}
              isNotificationsPending={pendingNotificationsListId === list.id}
              onToggleFavorite={() => toggleFavorite(list.id)}
              onToggleNotifications={() => notificationsMutation.mutate({ listId: list.id, notificationsEnabled: !list.notificationsEnabled })}
              onEdit={() => openEdit(list)}
              onShare={() => handleShare(list)}
              onTogglePublic={() => togglePublicMutation.mutate({ listId: list.id, isPublic: !list.isPublic })}
              onDelete={() => setDeleteTarget(list.id)}
            />
          ))}
          <NewListTile remaining={remainingSlots} onCreate={openCreate} />
        </div>
        <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0" />
          {t("lists:addHint")}
        </p>
      </>
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
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:sections.lists")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("lists:subtitle")}</p>
        </div>
        {maxLists === null ? null : <ListUsage count={listCount} max={maxLists} />}
      </header>

      {isRefetchError ? <StaleDataNotice className="mb-3" onRetry={() => refetch()} isRetrying={isFetching} /> : null}

      {body}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lists:editList")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field data-invalid={isEditNameTaken || undefined}>
              <Label htmlFor="edit-list-name">{t("common:labels.name")}</Label>
              <Input
                id="edit-list-name"
                {...NO_AUTOFILL_PROPS}
                value={editState?.name ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditState((prev) => (prev ? { ...prev, name: v } : prev));
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                maxLength={LIST_NAME_MAX_LENGTH}
                aria-invalid={isEditNameTaken || undefined}
              />
              {isEditNameTaken ? <FieldError>{t("lists:nameTaken")}</FieldError> : null}
            </Field>
            <div className="space-y-2">
              <Label htmlFor="edit-list-description">{t("lists:description")}</Label>
              <Input
                id="edit-list-description"
                {...NO_AUTOFILL_PROPS}
                value={editState?.description ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditState((prev) => (prev ? { ...prev, description: v } : prev));
                }}
                placeholder={t("common:placeholder.optional")}
                maxLength={LIST_DESCRIPTION_MAX_LENGTH}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!trimmedEditName || isEditNameTaken || editMutation.isPending}>
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

      {createOpenCount > 0 ? (
        <Suspense>
          <CreateListDialog key={createOpenCount} open={createOpen} onOpenChange={setCreateOpen} />
        </Suspense>
      ) : null}
    </div>
  );
}
