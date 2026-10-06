import { Add01Icon, Search01Icon, SecurityLockIcon, StarIcon, TaskAdd01Icon, TaskDaily01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListItemsInput } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ListWithItems, listKeys, listLimitQueryOptions, ownListsQueryOptions, prefetchOwnLists, updateList } from "@/features/lists/api";
import { sortFavoriteListsFirst } from "@/features/lists/sortLists";
import { useFavoriteLists } from "@/hooks/useFavoriteLists";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { isGloballyHandledError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

const CreateListDialog = lazy(() => import("./createListDialog").then((m) => ({ default: m.CreateListDialog })));

const SEARCH_THRESHOLD = 6;
const SKELETON_ROW_COUNT = 3;
const MENU_ROW_CLASS_NAME =
  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none motion-reduce:transition-none";

type ListMembershipChange = { list: ListWithItems; items: ListItemsInput; isAdding: boolean };

function changeListMembership({ list, items, isAdding }: ListMembershipChange) {
  return updateList(list.id, isAdding ? { addItems: items } : { removeItems: items });
}

type ListRowProps = {
  list: ListWithItems;
  checked: boolean;
  isFavorite: boolean;
  isToggling: boolean;
  disabled: boolean;
  count: number;
  countLabel: string;
  onToggle: () => void;
};

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input dark:bg-input/30",
      )}
    >
      {checked ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" /> : null}
    </span>
  );
}

function ListRow({ list, checked, isFavorite, isToggling, disabled, count, countLabel, onToggle }: ListRowProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      title={countLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(MENU_ROW_CLASS_NAME, "disabled:cursor-default")}
    >
      {isToggling ? <Spinner className="size-4 shrink-0" /> : <CheckMark checked={checked} />}
      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      {isFavorite ? <HugeiconsIcon icon={StarIcon} strokeWidth={2} className="size-3.5 shrink-0 text-amber-500 **:fill-current" /> : null}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function ListRowsSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-1.5 py-1.5">
          <Skeleton className="size-4 rounded-[4px]" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3 w-6" />
        </div>
      ))}
    </div>
  );
}

type AddToListPopoverProps = {
  stationId?: number;
  radiolineIds?: number[];
  ukeStationId?: number;
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  showTooltip?: boolean;
};

export function AddToListPopover(props: AddToListPopoverProps) {
  const { data: session } = useSettledSession();
  const { data: settings } = useSettings();
  const userId = session?.user?.id;

  if (userId === undefined || !settings?.features.lists) return null;

  return <AddToListPopoverInner {...props} userId={userId} />;
}

type AddToListPopoverInnerProps = AddToListPopoverProps & { userId: string };

function AddToListPopoverInner({
  userId,
  stationId,
  radiolineIds,
  ukeStationId,
  size = "sm",
  className,
  showLabel = false,
  labelClassName,
  showTooltip = true,
}: AddToListPopoverInnerProps) {
  const { t } = useTranslation(["lists", "common"]);
  const queryClient = useQueryClient();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOpenCount, setCreateOpenCount] = useState(0);
  const [search, setSearch] = useState("");

  const toggleMutation = useMutation({
    mutationFn: changeListMembership,
    onSuccess: (_result, { list, isAdding }) => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      void queryClient.invalidateQueries({ queryKey: listKeys.everyList() });
      void queryClient.invalidateQueries({ queryKey: ["list-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["list-radiolines"] });
      toast.success(isAdding ? t("lists:addedTo", { name: list.name }) : t("lists:removedFrom", { name: list.name }));
    },
    onError: (error) => {
      if (isGloballyHandledError(error)) return;
      toast.error(t("lists:updateFailed"));
    },
  });

  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery({
    ...ownListsQueryOptions(),
    enabled: popoverOpen || createOpen || toggleMutation.isPending,
  });
  const { data: listLimit } = useQuery({ ...listLimitQueryOptions(userId), enabled: popoverOpen });
  const { favoriteUuids, isFavorite } = useFavoriteLists();

  const lists = sortFavoriteListsFirst(data?.lists ?? [], favoriteUuids, (list) => list.id);
  const listCount = data?.total ?? lists.length;
  const isAtLimit = listLimit !== undefined && listCount >= listLimit;
  const searchQuery = search.trim().toLowerCase();
  const visibleLists = searchQuery ? lists.filter((list) => list.name.toLowerCase().includes(searchQuery)) : lists;
  const pendingListId = toggleMutation.isPending ? toggleMutation.variables?.list.id : undefined;
  const isBusy = toggleMutation.isPending || (isFetching && !isLoading);
  const isStationTarget = Boolean(stationId || ukeStationId);

  function warmLists() {
    prefetchOwnLists(queryClient, userId);
  }

  function openCreateDialog() {
    setPopoverOpen(false);
    setCreateOpenCount((count) => count + 1);
    setCreateOpen(true);
  }

  function isChecked(list: ListWithItems) {
    if (stationId) return list.items.stationIds.includes(stationId);
    if (ukeStationId) return list.items.officialSiteIds.includes(ukeStationId);
    if (radiolineIds) return radiolineIds.every((id) => list.items.microwaveLinkIds.includes(id));
    return false;
  }

  function handleToggle(list: ListWithItems) {
    const isAdding = !isChecked(list);
    if (stationId) toggleMutation.mutate({ list, isAdding, items: { stationIds: [stationId] } });
    else if (ukeStationId) toggleMutation.mutate({ list, isAdding, items: { officialSiteIds: [ukeStationId] } });
    else if (radiolineIds) toggleMutation.mutate({ list, isAdding, items: { microwaveLinkIds: radiolineIds } });
  }

  const label = t("lists:addToList");
  const triggerButton = (
    <button
      type="button"
      className={cn(
        size === "sm"
          ? cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "cursor-pointer text-muted-foreground")
          : "shrink-0 cursor-pointer rounded p-1.5 transition-colors hover:bg-muted",
        className,
      )}
      aria-label={label}
      onPointerEnter={warmLists}
      onFocus={warmLists}
    />
  );
  const triggerContent = (
    <>
      <HugeiconsIcon icon={TaskDaily01Icon} className={size === "sm" ? undefined : "size-4 text-muted-foreground"} />
      {showLabel ? <span className={labelClassName}>{label}</span> : null}
    </>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = <ListRowsSkeleton />;
  } else if (isLoadingError) {
    body = (
      <ErrorState
        title={t("lists:loadFailed")}
        description={null}
        onRetry={() => refetch()}
        isRetrying={isFetching}
        className="min-h-0 rounded-md border-0 px-2 py-3"
      />
    );
  } else if (lists.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-0.5 px-2 py-3 text-center">
        <HugeiconsIcon icon={TaskAdd01Icon} className="mb-1 size-5 text-muted-foreground" />
        <p className="text-sm font-medium">{t("lists:noLists")}</p>
        <p className="text-xs text-muted-foreground">{t("lists:noListsHint")}</p>
        <Button size="sm" className="mt-2" onClick={openCreateDialog}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          {t("lists:create")}
        </Button>
      </div>
    );
  } else if (visibleLists.length === 0) {
    body = <p className="px-1.5 py-2 text-center text-xs text-muted-foreground">{t("lists:noSearchResults")}</p>;
  } else {
    body = visibleLists.map((list) => {
      const stationCount = list.itemCounts.stations + list.itemCounts.officialSites;
      const radiolineCount = list.itemCounts.microwaveLinks;

      return (
        <ListRow
          key={list.id}
          list={list}
          checked={isChecked(list)}
          isFavorite={isFavorite(list.id)}
          isToggling={pendingListId === list.id}
          disabled={isBusy}
          count={isStationTarget ? stationCount : radiolineCount}
          countLabel={isStationTarget ? t("common:labels.stations", { count: stationCount }) : t("lists:radiolineCount", { count: radiolineCount })}
          onToggle={() => handleToggle(list)}
        />
      );
    });
  }

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (open) setSearch("");
        }}
      >
        {showTooltip ? (
          <Tooltip>
            <TooltipTrigger render={<PopoverTrigger render={triggerButton} onClick={(event: React.MouseEvent) => event.stopPropagation()} />}>
              {triggerContent}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger render={triggerButton} onClick={(event: React.MouseEvent) => event.stopPropagation()}>
            {triggerContent}
          </PopoverTrigger>
        )}

        <PopoverContent align="end" className="w-64 gap-0 p-1">
          <div className="flex items-center justify-between gap-3 px-1.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="truncate">{label}</span>
            {listLimit === undefined || lists.length === 0 ? null : (
              <span className="shrink-0 tabular-nums">{t("lists:usage", { count: listCount, max: listLimit })}</span>
            )}
          </div>

          {lists.length > SEARCH_THRESHOLD ? (
            <div className="relative mb-1">
              <HugeiconsIcon
                icon={Search01Icon}
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                {...NO_AUTOFILL_PROPS}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder={t("common:placeholder.search")}
                aria-label={t("common:actions.search")}
                className="h-7 pl-7 text-sm"
              />
            </div>
          ) : null}

          <div className="max-h-64 overflow-y-auto custom-scrollbar">{body}</div>

          {lists.length > 0 ? (
            <>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                disabled={isAtLimit}
                onClick={openCreateDialog}
                className={cn(MENU_ROW_CLASS_NAME, "text-muted-foreground disabled:pointer-events-none disabled:opacity-50")}
              >
                <HugeiconsIcon icon={isAtLimit ? SecurityLockIcon : Add01Icon} className="size-4 shrink-0" />
                {isAtLimit ? t("lists:limitReached") : t("lists:createNew")}
              </button>
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      {createOpenCount > 0 ? (
        <Suspense>
          <CreateListDialog
            key={createOpenCount}
            open={createOpen}
            onOpenChange={setCreateOpen}
            initialStationId={stationId}
            initialRadiolineIds={radiolineIds}
            initialUkeStationId={ukeStationId}
          />
        </Suspense>
      ) : null}
    </>
  );
}
