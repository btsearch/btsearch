import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/app/userAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxChipsInput, ComboboxList } from "@/components/ui/combobox";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { USER_SEARCH_MAX_LENGTH } from "@/features/admin/users/constants";
import { PICKER_SEARCH_MIN_LENGTH, type PickerUser, pickerSearchQueryOptions } from "@/features/admin/users/picker/api";
import { getPickerUserHandle, getPickerUserName, toPickerAvatarUser } from "@/features/admin/users/picker/pickerUser";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type TeamPersonPickerProps = {
  person: PickerUser | null;
  onPersonChange: (person: PickerUser | null) => void;
  heldUserIds: ReadonlySet<string>;
  labelledBy: string;
};

type PersonLabelProps = {
  user: PickerUser;
  isMuted?: boolean;
};

type PersonOptionProps = {
  user: PickerUser;
  isHeld: boolean;
};

type ChosenPersonProps = {
  user: PickerUser;
  onClear: () => void;
};

const SEARCH_DEBOUNCE_MS = 300;
const NO_SELECTION: string[] = [];
const NO_USERS: PickerUser[] = [];
const SKELETON_ROW_WIDTHS = [
  { name: "w-30", handle: "w-18" },
  { name: "w-24", handle: "w-22" },
  { name: "w-35", handle: "w-16" },
] as const;
const FRAME_CLASS = cn(
  "overflow-hidden rounded-lg border border-input bg-transparent transition-colors dark:bg-input/30",
  "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
);
const ROW_CLASS = "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5";
const OPTION_CLASS = cn(
  ROW_CLASS,
  "cursor-pointer outline-none select-none",
  "transition-[background-color] duration-100 motion-reduce:transition-none",
  "data-highlighted:bg-muted data-disabled:cursor-not-allowed",
);
const AVATAR_CLASS = "size-7 *:data-[slot=avatar-fallback]:text-[0.6875rem]";
const HINT_CLASS = "text-[0.8125rem] leading-[1.125rem] text-muted-foreground";

function collectFoundUsers(pages: readonly { data: PickerUser[] }[] | undefined): PickerUser[] {
  const found = new Map<string, PickerUser>();
  for (const page of pages ?? []) {
    for (const user of page.data) found.set(user.id, user);
  }
  return [...found.values()];
}

function PersonLabel({ user, isMuted = false }: PersonLabelProps) {
  const { t } = useTranslation("admin");
  const handle = getPickerUserHandle(user);

  return (
    <>
      <UserAvatar user={toPickerAvatarUser(user)} className={AVATAR_CLASS} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm leading-[1.125rem] font-medium", isMuted && "text-muted-foreground")}>
          {getPickerUserName(user) ?? t("users.picker.unknownUser")}
        </span>
        {handle === null ? null : <span className="block truncate text-xs text-muted-foreground">{handle}</span>}
      </span>
    </>
  );
}

function PersonOption({ user, isHeld }: PersonOptionProps) {
  const { t } = useTranslation("admin");

  return (
    <ComboboxPrimitive.Item value={user.id} disabled={isHeld} className={OPTION_CLASS}>
      <PersonLabel user={user} isMuted={isHeld} />
      {isHeld ? <Badge variant="secondary">{t("reference.country.team.dialog.alreadyHolds")}</Badge> : null}
    </ComboboxPrimitive.Item>
  );
}

function ChosenPerson({ user, onClear }: ChosenPersonProps) {
  const { t } = useTranslation("admin");
  const clearLabel = t("users.picker.clearSelection");

  return (
    <div className={cn(ROW_CLASS, "bg-primary/10")}>
      <PersonLabel user={user} />
      <Tooltip>
        <TooltipTrigger
          aria-label={clearLabel}
          render={<Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground" />}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{clearLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function PersonSkeletonRows() {
  return (
    <div aria-hidden="true">
      {SKELETON_ROW_WIDTHS.map((widths) => (
        <div key={widths.name} className={ROW_CLASS}>
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

export function TeamPersonPicker({ person, onPersonChange, heldUserIds, labelledBy }: TeamPersonPickerProps) {
  const { t } = useTranslation("admin");
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const searchQuery = useInfiniteQuery(pickerSearchQueryOptions(debouncedSearch.trim()));

  const searchTerm = search.trim();
  const isSearching = searchTerm.length >= PICKER_SEARCH_MIN_LENGTH;
  const isSearchBusy = isSearching && (debouncedSearch.trim() !== searchTerm || (searchQuery.isFetching && !searchQuery.isFetchingNextPage));
  const foundUsers = isSearching ? collectFoundUsers(searchQuery.data?.pages) : NO_USERS;
  const hasSearchResults = isSearching && searchQuery.data !== undefined;
  const hasSearchFailed = isSearching && !hasSearchResults && searchQuery.isError;
  const isSearchPending = isSearching && !hasSearchResults && !hasSearchFailed;
  const hasNoResults = hasSearchResults && foundUsers.length === 0;
  const clearSearchLabel = t("users.picker.clearSearch");
  const personName = person === null ? null : (getPickerUserName(person) ?? t("users.picker.unknownUser"));

  let statusText = "";
  if (personName !== null) statusText = t("reference.country.team.dialog.chosenPerson", { name: personName });
  else if (isSearchPending) statusText = t("common:actions.loading");
  else if (hasNoResults) statusText = t("users.picker.noUsers");
  else if (hasSearchResults) statusText = t("users.picker.selected", { count: foundUsers.length });

  function choosePerson(userIds: string[]) {
    const chosenUserId = userIds.at(-1);
    const chosenUser = foundUsers.find((user) => user.id === chosenUserId);
    if (chosenUser === undefined) return;

    setSearch("");
    onPersonChange(chosenUser);
  }

  function changeSearch(nextSearch: string) {
    setSearch(nextSearch);
    if (person !== null && nextSearch.trim() !== "") onPersonChange(null);
  }

  function clearSearch() {
    setSearch("");
    inputRef.current?.focus();
  }

  function clearPerson() {
    onPersonChange(null);
    inputRef.current?.focus();
  }

  return (
    <div className={FRAME_CLASS}>
      <Combobox
        inline
        open
        multiple
        items={foundUsers.map((user) => user.id)}
        filter={null}
        value={NO_SELECTION}
        onValueChange={choosePerson}
        inputValue={search}
        onInputValueChange={(nextSearch, details) => {
          if (details.reason === "input-clear") {
            details.cancel();
            return;
          }
          changeSearch(nextSearch);
        }}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b pr-1.5 pl-2.5">
          <HugeiconsIcon icon={Search01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <ComboboxChipsInput
            ref={inputRef}
            aria-labelledby={labelledBy}
            placeholder={t("users.picker.searchPlaceholder")}
            maxLength={USER_SEARCH_MAX_LENGTH}
            className="h-full min-w-0 text-base md:text-sm"
          />
          <span className="flex size-6 shrink-0 items-center justify-center">
            {isSearchBusy ? <Spinner className="size-3.5" /> : null}
            {!isSearchBusy && search !== "" ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label={clearSearchLabel}
                  render={<Button type="button" variant="ghost" size="icon-xs" className="cursor-pointer text-muted-foreground" />}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearSearch}
                >
                  <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>{clearSearchLabel}</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        </div>

        <div className="custom-scrollbar max-h-52 overflow-y-auto overscroll-contain p-1">
          <ComboboxList aria-label={t("nav:items.users")} className="max-h-none overflow-visible p-0">
            {foundUsers.map((user) => (
              <PersonOption key={user.id} user={user} isHeld={heldUserIds.has(user.id)} />
            ))}
          </ComboboxList>
          {person === null ? null : <ChosenPerson user={person} onClear={clearPerson} />}
          {isSearchPending ? <PersonSkeletonRows /> : null}
          {hasSearchFailed ? (
            <ErrorState
              title={t("users.picker.error")}
              description={null}
              onRetry={() => searchQuery.refetch()}
              isRetrying={searchQuery.isFetching}
              className="min-h-0 rounded-none border-0 bg-transparent px-5 py-5"
            />
          ) : null}
          {hasNoResults ? (
            <div className="flex flex-col items-center gap-0.5 px-5 pt-5 pb-6 text-center">
              <p className="text-sm font-medium">{t("users.picker.noUsers")}</p>
              <p className={HINT_CLASS}>{t("users.picker.noUsersHint")}</p>
            </div>
          ) : null}
          {person === null && !isSearching ? <p className={cn("px-2 py-2", HINT_CLASS)}>{t("users.picker.typeHint")}</p> : null}
          {foundUsers.length > 0 && searchQuery.hasNextPage ? (
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
      </Combobox>
    </div>
  );
}
