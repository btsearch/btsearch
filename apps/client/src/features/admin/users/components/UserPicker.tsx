import { Cancel01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InlineError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { API_BASE, fetchJson } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PickerUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

const EMPTY_USERS: PickerUser[] = [];

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

interface UserPickerProps {
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
  className?: string;
}

export function UserPicker({ selectedUserIds, onSelectionChange, className }: UserPickerProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery({
    queryKey: ["admin", "users", "picker", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return fetchJson<{ data: PickerUser[]; total: number }>(`${API_BASE}/admin/users/search?${params}`);
    },
  });

  const users = data?.data ?? EMPTY_USERS;
  const selectedSet = new Set(selectedUserIds);

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onSelectionChange(selectedUserIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedUserIds, id]);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        />
        <Input
          className="h-8 pl-8 pr-8 text-sm"
          placeholder={t("users.picker.searchPlaceholder")}
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {!isLoading &&
          !isLoadingError &&
          (users.length === 0
            ? debouncedSearch
              ? t("users.picker.noMatch", { search: debouncedSearch })
              : t("users.picker.noUsers")
            : t("users.picker.selected", { count: users.length }))}
      </div>

      <div className="overflow-y-auto max-h-64 rounded-md border bg-background divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="size-4 rounded bg-muted animate-pulse shrink-0" />
              <div className="size-6 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                <div className="h-2.5 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))
        ) : isLoadingError ? (
          <InlineError size="sm" title={t("users.picker.error")} onRetry={() => refetch()} isRetrying={isFetching} className="m-1" />
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            {debouncedSearch ? t("users.picker.noMatch", { search: debouncedSearch }) : t("users.picker.noUsers")}
          </div>
        ) : (
          <>
            <div role="listbox" aria-multiselectable="true" aria-label={t("users.picker.searchPlaceholder")} className="divide-y divide-border">
              {users.map((user) => {
                const checked = selectedSet.has(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(user.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50",
                      checked && "bg-primary/10 hover:bg-primary/15",
                    )}
                  >
                    <CheckMark checked={checked} />
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar size="sm" className="shrink-0">
                        {user.image && <AvatarImage src={resolveAvatarUrl(user.image)} />}
                        <AvatarFallback>{user.name?.charAt(0)?.toUpperCase() ?? "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-tight">{user.name}</div>
                        {user.username && <div className="truncate text-xs text-muted-foreground leading-tight">@{user.username}</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {data && data.total > users.length && (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t bg-muted/20">
                {t("common:pagination.showing", { shown: users.length, total: data.total })}
              </div>
            )}
          </>
        )}
      </div>

      {selectedUserIds.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground -mt-1 pt-1 border-t border-border/60">
          <span>{t("users.picker.selected", { count: selectedUserIds.length })}</span>
          <button
            type="button"
            onClick={() => onSelectionChange([])}
            className="text-destructive/60 hover:text-destructive transition-colors duration-150"
          >
            {t("common:actions.clear")}
          </button>
        </div>
      )}
    </div>
  );
}
