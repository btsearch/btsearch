import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminUser } from "@/features/admin/users/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
const EMPTY_USERS: AdminUser[] = [];

const columnHelper = createColumnHelper<AppTableFeatures, AdminUser>();

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

type RoleFilter = "all" | "user" | "editor" | "admin";
type BannedFilter = "all" | "true" | "false";

function AdminUsersPage() {
  "use no memo";
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const columns = useColumns();
  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [bannedFilter, setBannedFilter] = useState<BannedFilter>("all");
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [debouncedSearch, setPagination]);

  const { data, isLoading } = useQuery({
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
  });

  const users = (data?.data as AdminUser[]) ?? EMPTY_USERS;
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

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{t("users.filters.labelRole")}</label>
            <Select
              value={roleFilter}
              onValueChange={(v) => {
                setRoleFilter(v as RoleFilter);
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
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
              onValueChange={(v) => {
                setBannedFilter(v as BannedFilter);
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
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
          <Input placeholder={t("common:placeholder.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn("flex-1 min-h-0 overflow-x-hidden", pagination.pageSize > autoPageSize ? "overflow-y-auto" : "overflow-y-clip")}
      >
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
