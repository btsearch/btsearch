import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon, Search01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import type { AdminUser } from "@/features/admin/users/types";
import { MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/format";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};
const MOBILE_ROW_HEIGHT_FALLBACK = 108;
const MOBILE_PAGINATION_CONFIG = { headerHeight: 0, paginationHeight: 51, minRows: 1 };
const EMPTY_USERS: AdminUser[] = [];
const MOBILE_USER_SKELETON_ROWS = Array.from({ length: 6 }, (_, index) => (
  <div key={index} className="space-y-2.5 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="size-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-5 w-16 animate-pulse rounded bg-muted" />
    </div>
    <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
    <div className="flex items-center justify-between gap-3">
      <div className="h-5 w-14 animate-pulse rounded bg-muted" />
      <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
    </div>
  </div>
));

const columnHelper = createColumnHelper<AppTableFeatures, AdminUser>();

type RoleFilter = "all" | "user" | "editor" | "admin";
type BannedFilter = "all" | "true" | "false";

const ROLE_FILTERS: RoleFilter[] = ["all", "user", "editor", "admin"];
const BANNED_FILTERS: BannedFilter[] = ["all", "false", "true"];

function isRoleFilter(value: unknown): value is RoleFilter {
  return typeof value === "string" && ROLE_FILTERS.some((filter) => filter === value);
}

function isBannedFilter(value: unknown): value is BannedFilter {
  return typeof value === "string" && BANNED_FILTERS.some((filter) => filter === value);
}

function getRoleLabel(t: TFunction, role: string | undefined): string {
  if (role === "admin") return t("users.filters.roleAdmin");
  if (role === "editor") return t("users.filters.roleEditor");
  if (role === undefined || role === "user") return t("users.filters.roleUser");
  return role;
}

function getRoleFilterLabel(t: TFunction, role: RoleFilter): string {
  return role === "all" ? t("users.filters.allRoles") : getRoleLabel(t, role);
}

function getBannedFilterLabel(t: TFunction, banned: BannedFilter): string {
  if (banned === "true") return t("users.filters.banned");
  if (banned === "false") return t("users.filters.active");
  return t("users.filters.allStatuses");
}

function formatUserCreatedDate(value: Date, locale: string): string {
  return new Date(value).toLocaleDateString(locale);
}

function UserIdentity({ user }: { user: AdminUser }) {
  const fallback = (user.name || user.username || user.email).charAt(0).toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar size="sm" className="shrink-0">
        {user.image ? <AvatarImage src={resolveAvatarUrl(user.image)} alt="" /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-medium">{user.name}</div>
        {user.username ? <div className="truncate text-xs text-muted-foreground">@{user.username}</div> : null}
      </div>
    </div>
  );
}

function UserRoleBadge({ user, t }: { user: AdminUser; t: TFunction }) {
  const role = user.role ?? "user";
  return <Badge variant={role === "admin" ? "default" : "secondary"}>{getRoleLabel(t, role)}</Badge>;
}

function UserStatusBadge({ user, t }: { user: AdminUser; t: TFunction }) {
  return user.banned ? (
    <Badge variant="destructive">{t("users.filters.banned")}</Badge>
  ) : (
    <Badge variant="secondary">{t("users.filters.active")}</Badge>
  );
}

function useColumns() {
  const { t } = useTranslation("admin");
  return useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: t("users.table.name"),
          size: 250,
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                {row.original.image && <AvatarImage src={resolveAvatarUrl(row.original.image)} />}
                <AvatarFallback>{row.original.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{row.original.name}</div>
                {row.original.username && <div className="truncate text-xs text-muted-foreground">@{row.original.username}</div>}
              </div>
            </div>
          ),
        }),
        columnHelper.accessor("email", {
          header: t("users.table.email"),
          size: 250,
          cell: ({ getValue }) => <span className="truncate">{getValue()}</span>,
        }),
        columnHelper.accessor("role", {
          header: t("users.table.role"),
          size: 120,
          cell: ({ getValue }) => {
            const role = getValue() ?? "user";
            return <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>;
          },
        }),
        columnHelper.accessor("banned", {
          header: t("users.table.status"),
          size: 120,
          cell: ({ getValue }) => {
            const banned = getValue();
            if (banned) return <Badge variant="destructive">Banned</Badge>;
            return <Badge variant="secondary">Active</Badge>;
          },
        }),
        columnHelper.accessor("createdAt", {
          header: t("users.table.created"),
          size: 150,
          cell: ({ getValue }) => new Date(getValue()).toLocaleDateString(),
        }),
      ]),
    [t],
  );
}

type UsersMobileFilterRailProps = {
  search: string;
  roleFilter: RoleFilter;
  bannedFilter: BannedFilter;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: RoleFilter) => void;
  onBannedChange: (value: BannedFilter) => void;
  onClear: () => void;
};

function UsersMobileFilterRail({
  search,
  roleFilter,
  bannedFilter,
  onSearchChange,
  onRoleChange,
  onBannedChange,
  onClear,
}: UsersMobileFilterRailProps) {
  const { t } = useTranslation(["admin", "common"]);
  const hasSearch = search.trim().length > 0;
  const activeFilterCount = Number(hasSearch) + Number(roleFilter !== "all") + Number(bannedFilter !== "all");

  return (
    <div className="flex w-max items-center gap-1" role="toolbar" aria-label={t("common:labels.filters")}>
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 w-full pl-8 pr-8"
            aria-label={t("common:labels.search")}
            placeholder={t("common:placeholder.search")}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={roleFilter !== "all"} icon={ShieldUserIcon} label={t("users.filters.labelRole")}>
        <MobileFilterPanelTitle>{t("users.filters.labelRole")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {ROLE_FILTERS.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={roleFilter === role}
              onClick={() => onRoleChange(role)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                roleFilter === role ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {getRoleFilterLabel(t, role)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={bannedFilter !== "all"} icon={CheckmarkCircle02Icon} label={t("users.filters.labelStatus")}>
        <MobileFilterPanelTitle>{t("users.filters.labelStatus")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {BANNED_FILTERS.map((banned) => (
            <button
              key={banned}
              type="button"
              aria-pressed={bannedFilter === banned}
              onClick={() => onBannedChange(banned)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                bannedFilter === banned ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {getBannedFilterLabel(t, banned)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("common:actions.clearAll")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function UserMobileRow({ user, locale, t }: { user: AdminUser; locale: string; t: TFunction }) {
  const roleLabel = getRoleLabel(t, user.role);
  const statusLabel = t(user.banned ? "users.filters.banned" : "users.filters.active");
  const createdDate = formatUserCreatedDate(user.createdAt, locale);
  const ariaLabel = [user.name, user.username ? `@${user.username}` : null, user.email, roleLabel, statusLabel, createdDate]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      to="/admin/users/$id"
      params={{ id: user.id }}
      className="group block px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={ariaLabel}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <UserIdentity user={user} />
        <UserStatusBadge user={user} t={t} />
      </div>
      <div className="mt-2 truncate text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
        <UserRoleBadge user={user} t={t} />
        <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={new Date(user.createdAt).toISOString()}>
          {createdDate}
        </time>
      </div>
    </Link>
  );
}

type UsersMobileListProps = {
  isLoading: boolean;
  isError: boolean;
  users: AdminUser[];
  pageSize: number;
  locale: string;
  listRef: (node: HTMLUListElement | null) => void;
  onRetry: () => unknown;
};

function UsersMobileList({ isLoading, isError, users, pageSize, locale, listRef, onRetry }: UsersMobileListProps) {
  const { t } = useTranslation(["admin", "common"]);

  if (isError && users.length === 0)
    return (
      <div
        className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-t-lg border border-b-0 bg-card px-4 text-center text-muted-foreground"
        role="alert"
      >
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/5 text-destructive/60">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
        </div>
        <p className="font-medium text-foreground">{t("common:error.title")}</p>
        <p className="mt-1 max-w-md text-sm">{t("common:error.description")}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void onRetry()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );

  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      {isLoading ? (
        <div className="divide-y" aria-hidden="true">
          {MOBILE_USER_SKELETON_ROWS.slice(0, Math.min(pageSize, MOBILE_USER_SKELETON_ROWS.length))}
        </div>
      ) : null}
      {!isLoading && users.length === 0 ? (
        <div className="flex min-h-64 flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
          {t("users.picker.noUsers")}
        </div>
      ) : null}
      {!isLoading && users.length > 0 ? (
        <ul ref={listRef} className="divide-y">
          {users.map((user) => (
            <li key={user.id}>
              <UserMobileRow user={user} locale={locale} t={t} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AdminUsersPage() {
  "use no memo";
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("admin");
  const columns = useColumns();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [bannedFilter, setBannedFilter] = useState<BannedFilter>("all");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { listRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(MOBILE_ROW_HEIGHT_FALLBACK, {
    round: false,
    safetyBuffer: 0,
  });
  const desktopPagination = useTablePagination(TABLE_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination({ ...MOBILE_PAGINATION_CONFIG, rowHeight: mobileRowHeight });
  const { setPagination: setDesktopPagination } = desktopPagination;
  const { setPagination: setMobilePagination } = mobilePagination;
  const desktopPageIndex = desktopPagination.pagination.pageIndex;
  const mobilePageIndex = mobilePagination.pagination.pageIndex;
  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions } = isMobile ? mobilePagination : desktopPagination;

  const resetPage = useCallback(() => {
    if (desktopPageIndex !== 0) setDesktopPagination((previous) => ({ ...previous, pageIndex: 0 }));
    if (mobilePageIndex !== 0) setMobilePagination((previous) => ({ ...previous, pageIndex: 0 }));
  }, [desktopPageIndex, mobilePageIndex, setDesktopPagination, setMobilePagination]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      resetPage();
    },
    [resetPage],
  );

  const handleRoleChange = useCallback(
    (value: RoleFilter) => {
      setRoleFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleBannedChange = useCallback(
    (value: BannedFilter) => {
      setBannedFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setRoleFilter("all");
    setBannedFilter("all");
    resetPage();
  }, [resetPage]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin", "users", pagination.pageIndex, pagination.pageSize, debouncedSearch, roleFilter, bannedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(pagination.pageSize),
        offset: String(pagination.pageIndex * pagination.pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (bannedFilter !== "all") params.set("banned", bannedFilter);
      return fetchJson<{ data: AdminUser[]; total: number; limit: number }>(`${API_BASE}/admin/users?${params}`);
    },
    placeholderData: isMobile ? keepPreviousData : undefined,
  });

  const users = data?.data ?? EMPTY_USERS;
  const total = data?.total ?? 0;

  const table = useTable({
    features: appTableFeatures,
    data: users,
    columns,
    manualPagination: true,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const mobileFilterRail = isMobile ? (
    <UsersMobileFilterRail
      search={search}
      roleFilter={roleFilter}
      bannedFilter={bannedFilter}
      onSearchChange={handleSearchChange}
      onRoleChange={handleRoleChange}
      onBannedChange={handleBannedChange}
      onClear={clearFilters}
    />
  ) : null;

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      {!isMobile ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("users.filters.labelRole")}</label>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  if (isRoleFilter(value)) handleRoleChange(value);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t("users.filters.allRoles")} />
                </SelectTrigger>
                <SelectContent className="min-w-40">
                  <SelectItem value="all">{t("users.filters.allRoles")}</SelectItem>
                  <SelectItem value="user">{t("users.filters.roleUser")}</SelectItem>
                  <SelectItem value="editor">{t("users.filters.roleEditor")}</SelectItem>
                  <SelectItem value="admin">{t("users.filters.roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("users.filters.labelStatus")}</label>
              <Select
                value={bannedFilter}
                onValueChange={(value) => {
                  if (isBannedFilter(value)) handleBannedChange(value);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t("users.filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent className="min-w-40">
                  <SelectItem value="all">{t("users.filters.allStatuses")}</SelectItem>
                  <SelectItem value="false">{t("users.filters.active")}</SelectItem>
                  <SelectItem value="true">{t("users.filters.banned")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="relative w-full sm:max-w-sm sm:flex-1">
            <HugeiconsIcon icon={Search01Icon} className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("common:placeholder.search")}
              value={search}
              onChange={(event) => handleSearchChange(event.currentTarget.value)}
              className="pl-8"
            />
          </div>
        </div>
      ) : null}
      {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 min-h-0 overflow-x-hidden",
          isMobile ? "overflow-y-auto overscroll-y-contain" : pagination.pageSize > autoPageSize ? "overflow-y-auto" : "overflow-y-clip",
          hasFloatingMobileFilters && "mb-10",
        )}
        aria-busy={isFetching}
      >
        {isMobile && isFetching && !isLoading ? (
          <div
            className="absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm"
            role="status"
          >
            <Spinner role="presentation" aria-hidden="true" className="size-3.5" />
            {t("common:actions.updating")}
          </div>
        ) : null}
        {isMobile && !isFetching && isError && users.length > 0 ? (
          <div
            className="absolute right-2 top-2 z-20 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-2 py-1 text-xs text-destructive shadow-sm"
            role="alert"
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
            {t("common:placeholder.errorFetching")}
            <Button type="button" variant="ghost" size="xs" onClick={() => void refetch()}>
              {t("common:actions.retry")}
            </Button>
          </div>
        ) : null}
        {isMobile ? (
          <div className="flex flex-col">
            <UsersMobileList
              isLoading={isLoading}
              isError={isError}
              users={users}
              pageSize={pagination.pageSize}
              locale={i18n.language}
              listRef={listRef}
              onRetry={refetch}
            />
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
            </DataTable.PaginationFooter>
          </div>
        ) : (
          <div className="min-w-full">
            <div className="custom-scrollbar overflow-x-auto">
              <DataTable.Root table={table} className="block rounded-b-none border-b-0">
                <DataTable.Table>
                  <DataTable.Header />
                  {isLoading ? (
                    <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} />
                  ) : (
                    <DataTable.Body onRowClick={(user) => navigate({ to: "/admin/users/$id", params: { id: (user as AdminUser).id } })} />
                  )}
                </DataTable.Table>
              </DataTable.Root>
            </div>
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
            </DataTable.PaginationFooter>
          </div>
        )}
      </div>

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="w-[calc(100vw-1.5rem)] min-w-0">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="mx-auto w-max">{mobileFilterRail}</div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/users/")({
  component: AdminUsersPage,
  staticData: {
    titleKey: "breadcrumbs.users",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", i18nNamespace: "admin" }],
  },
});
