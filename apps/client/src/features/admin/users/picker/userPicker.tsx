import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Cancel01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { USER_SEARCH_MAX_LENGTH } from "../constants";
import {
  PICKER_SEARCH_MIN_LENGTH,
  type PickerUser,
  pickerSearchQueryOptions,
  pickerSelectedUsersQueryOptions,
  primePickerSelectedUsers,
} from "./api";
import { getPickerUserHandle, getPickerUserName, indexPickerUsers, toPickerAvatarUser } from "./pickerUser";
import { UserAvatar } from "@/components/app/userAvatar";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxChipsInput, ComboboxGroup, ComboboxLabel, ComboboxList } from "@/components/ui/combobox";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSettledSession } from "@/hooks/useSettledSession";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROW_WIDTHS = [
  { name: "w-30", handle: "w-18" },
  { name: "w-24", handle: "w-22" },
  { name: "w-35", handle: "w-16" },
] as const;
const UNKNOWN_AVATAR_USER = { name: "?", image: null };
const OPTION_CLASS = cn(
  "group/option flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none select-none",
  "transition-[background-color] duration-100 motion-reduce:transition-none",
  "data-highlighted:bg-muted data-[selected]:bg-primary/10 data-[selected]:data-highlighted:bg-primary/15",
);
const TICK_CLASS = cn(
  "size-4 shrink-0 scale-50 text-primary opacity-0 transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
  "group-data-[selected]/option:scale-100 group-data-[selected]/option:opacity-100",
);
const FADE_IN_CLASS = "motion-safe:animate-in motion-safe:fade-in-0";
const ROWS_ENTER_CLASS = cn(FADE_IN_CLASS, "motion-safe:slide-in-from-top-1");
const FOOTER_COLLAPSE_CLASS = "grid shrink-0 transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none";

type UserPickerProps = {
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

type PickerRow = { id: string; user: PickerUser | null };

function collectFoundUsers(pages: readonly { data: PickerUser[] }[] | undefined): PickerUser[] {
  const found = new Map<string, PickerUser>();
  for (const page of pages ?? []) {
    for (const user of page.data) found.set(user.id, user);
  }
  return [...found.values()];
}

function PickerOption({ row, isViewer }: { row: PickerRow; isViewer: boolean }) {
  const { t } = useTranslation("admin");
  const { id, user } = row;
  const name = (user === null ? null : getPickerUserName(user)) ?? t("users.picker.unknownUser");
  const handle = user === null ? id : getPickerUserHandle(user);

  return (
    <ComboboxPrimitive.Item value={id} className={OPTION_CLASS}>
      <UserAvatar
        user={user === null ? UNKNOWN_AVATAR_USER : toPickerAvatarUser(user)}
        className="size-7 *:data-[slot=avatar-fallback]:text-[0.6875rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-[1.125rem] font-medium">
          {name}
          {isViewer ? <span className="font-normal text-muted-foreground"> {t("users.shared.you")}</span> : null}
        </span>
        {handle === null ? null : <span className="block truncate text-xs text-muted-foreground">{handle}</span>}
      </span>
      <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className={TICK_CLASS} />
    </ComboboxPrimitive.Item>
  );
}

function PickerSkeletonRows({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div aria-hidden="true" className={FADE_IN_CLASS}>
      {SKELETON_ROW_WIDTHS.slice(0, count).map((widths) => (
        <div key={widths.name} className="flex min-h-11 items-center gap-2.5 px-2 py-1.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className={cn("h-3", widths.name)} />
            <Skeleton className={cn("h-2.5", widths.handle)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PickerLoadError({ onRetry, isRetrying }: { onRetry: () => unknown; isRetrying: boolean }) {
  const { t } = useTranslation("admin");

  return (
    <ErrorState
      title={t("users.picker.error")}
      description={null}
      onRetry={onRetry}
      isRetrying={isRetrying}
      className="min-h-0 rounded-none border-0 bg-transparent px-5 py-5"
    />
  );
}

export function UserPicker({ selectedUserIds, onSelectionChange }: UserPickerProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [shownSelectedCount, setShownSelectedCount] = useState(selectedUserIds.length);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const { data: session } = useSettledSession();
  const selectedUsersQuery = useQuery(pickerSelectedUsersQueryOptions(selectedUserIds));
  const searchQuery = useInfiniteQuery(pickerSearchQueryOptions(debouncedSearch.trim()));

  const searchTerm = search.trim();
  const isSearching = searchTerm.length >= PICKER_SEARCH_MIN_LENGTH;
  const isSearchBusy = isSearching && (debouncedSearch.trim() !== searchTerm || (searchQuery.isFetching && !searchQuery.isFetchingNextPage));
  const hasSelection = selectedUserIds.length > 0;
  if (hasSelection && shownSelectedCount !== selectedUserIds.length) setShownSelectedCount(selectedUserIds.length);
  const viewer = session?.user;
  const viewerUser: PickerUser | null = viewer
    ? { id: viewer.id, username: viewer.username ?? null, name: viewer.name, image: viewer.image ?? null }
    : null;

  const foundUsers = collectFoundUsers(searchQuery.data?.pages);
  const knownUsers = indexPickerUsers(selectedUsersQuery.data ?? []);
  for (const user of foundUsers) knownUsers.set(user.id, user);
  if (viewerUser !== null) knownUsers.set(viewerUser.id, viewerUser);

  const selectedRows: PickerRow[] = [];
  let resolvingSelectedCount = 0;
  let hasSelectedLookupFailed = false;
  for (const id of selectedUserIds) {
    const user = knownUsers.get(id);
    if (user !== undefined) selectedRows.push({ id, user });
    else if (selectedUsersQuery.isFetching) resolvingSelectedCount += 1;
    else if (selectedUsersQuery.isError) hasSelectedLookupFailed = true;
    else selectedRows.push({ id, user: null });
  }

  let rows: PickerRow[];
  let groupName: "results" | "selected" | "suggestions";
  if (isSearching) {
    rows = foundUsers.map((user) => ({ id: user.id, user }));
    groupName = "results";
  } else if (hasSelection) {
    rows = selectedRows;
    groupName = "selected";
  } else {
    rows = viewerUser === null ? [] : [{ id: viewerUser.id, user: viewerUser }];
    groupName = "suggestions";
  }

  const hasSearchResults = isSearching && searchQuery.data !== undefined;
  const hasSearchFailed = isSearching && !hasSearchResults && searchQuery.isError;
  const isSearchPending = isSearching && !hasSearchResults && !hasSearchFailed;
  const hasNoResults = hasSearchResults && rows.length === 0;
  const pendingSearchRowCount = isSearchPending ? SKELETON_ROW_WIDTHS.length : 0;
  const pendingRowCount = isSearching ? pendingSearchRowCount : resolvingSelectedCount;

  let statusText = "";
  if (isSearchPending) statusText = t("common:actions.loading");
  else if (hasNoResults) statusText = t("users.picker.noUsers");
  else if (hasSearchResults) statusText = t("users.picker.selected", { count: rows.length });

  function handleSelectionChange(nextUserIds: string[]) {
    const nextUsers: PickerUser[] = [];
    for (const id of nextUserIds) {
      const user = knownUsers.get(id);
      if (user !== undefined) nextUsers.push(user);
    }
    if (nextUsers.length > 0 && nextUsers.length === nextUserIds.length) primePickerSelectedUsers(queryClient, nextUsers);
    onSelectionChange(nextUserIds);
  }

  function returnFocusToSearch(pressedButton: HTMLElement) {
    if (pressedButton === document.activeElement) inputRef.current?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col">
      <Combobox
        inline
        open
        multiple
        items={rows.map((row) => row.id)}
        filter={null}
        value={selectedUserIds}
        onValueChange={handleSelectionChange}
        inputValue={search}
        onInputValueChange={(value, details) => {
          if (details.reason === "input-clear") {
            details.cancel();
            return;
          }
          setSearch(value);
        }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b pr-2 pl-3 focus-within:border-ring">
          <HugeiconsIcon icon={Search01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <ComboboxChipsInput
            ref={inputRef}
            aria-label={t("users.picker.searchLabel")}
            placeholder={t("users.picker.searchPlaceholder")}
            maxLength={USER_SEARCH_MAX_LENGTH}
            className="h-full min-w-0 text-base md:text-sm"
          />
          <span className="flex size-6 shrink-0 items-center justify-center">
            {isSearchBusy ? <Spinner className="size-3.5" /> : null}
            {!isSearchBusy && search !== "" ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label={t("users.picker.clearSearch")}
                  render={<Button type="button" variant="ghost" size="icon-xs" className="cursor-pointer text-muted-foreground" />}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    returnFocusToSearch(event.currentTarget);
                    setSearch("");
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>{t("users.picker.clearSearch")}</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        </div>

        <div className="custom-scrollbar max-h-75 overflow-y-auto overscroll-contain p-1">
          <ComboboxList aria-label={t("nav:items.users")} className="max-h-none overflow-visible p-0">
            {rows.length > 0 ? (
              <ComboboxGroup key={groupName} className={ROWS_ENTER_CLASS}>
                <ComboboxLabel className="pb-1">{t(`users.picker.groups.${groupName}`)}</ComboboxLabel>
                {rows.map((row) => (
                  <PickerOption key={row.id} row={row} isViewer={row.id === viewerUser?.id} />
                ))}
              </ComboboxGroup>
            ) : null}
          </ComboboxList>
          <PickerSkeletonRows count={pendingRowCount} />
          {hasSearchFailed ? <PickerLoadError onRetry={() => searchQuery.refetch()} isRetrying={searchQuery.isFetching} /> : null}
          {!isSearching && hasSelectedLookupFailed ? (
            <PickerLoadError onRetry={() => selectedUsersQuery.refetch()} isRetrying={selectedUsersQuery.isFetching} />
          ) : null}
          {hasNoResults ? (
            <div className={cn("flex flex-col items-center gap-0.5 px-5 pt-5 pb-6 text-center", FADE_IN_CLASS)}>
              <p className="text-sm font-medium">{t("users.picker.noUsers")}</p>
              <p className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{t("users.picker.noUsersHint")}</p>
            </div>
          ) : null}
          {isSearching ? null : (
            <p className="px-2 pt-2.5 pb-2 text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{t("users.picker.typeHint")}</p>
          )}
          {isSearching && rows.length > 0 && searchQuery.hasNextPage ? (
            <div className="px-1 pt-1 pb-0.5">
              {searchQuery.isFetchNextPageError ? (
                <InlineError size="sm" onRetry={() => searchQuery.fetchNextPage()} isRetrying={searchQuery.isFetchingNextPage} />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={searchQuery.isFetchingNextPage}
                  focusableWhenDisabled
                  className="w-full cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50"
                  onClick={() => void searchQuery.fetchNextPage()}
                >
                  {searchQuery.isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
                  {t("common:actions.showMore")}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {statusText}
        </div>

        <div inert={!hasSelection} className={cn(FOOTER_COLLAPSE_CLASS, hasSelection ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-t bg-muted/50 py-1.5 pr-1.5 pl-3">
              <span className="text-xs text-muted-foreground tabular-nums">{t("users.picker.selectedCount", { count: shownSelectedCount })}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer text-muted-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  returnFocusToSearch(event.currentTarget);
                  onSelectionChange([]);
                }}
              >
                {t("common:actions.clear")}
              </Button>
            </div>
          </div>
        </div>
      </Combobox>
    </div>
  );
}
