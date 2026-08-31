import { AlertCircleIcon, Cancel01Icon, Delete02Icon, Globe02Icon, ListViewIcon, LockIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { useNavActionTarget } from "@/contexts/navActions";
import { type UserListSummary, deleteList, fetchUserLists } from "@/features/lists/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { resolveAvatarUrl } from "@/lib/format";
import { formatShortDate } from "@/lib/format";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};

const columnHelper = createColumnHelper<AppTableFeatures, UserListSummary>();

function ListsMobileFilterRail({ search, onSearchChange }: { search: string; onSearchChange: (value: string) => void }) {
  const { t } = useTranslation("common");
  const hasSearch = search.trim().length > 0;

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("labels.search")}>
        <MobileFilterPanelTitle>{t("labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={t("placeholder.search")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      {hasSearch ? (
        <button
          type="button"
          onClick={() => onSearchChange("")}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("actions.clearAll")}
        </button>
      ) : null}
    </div>
  );
}

function AdminListsPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navActionTarget = useNavActionTarget();
  const hasFloatingRail = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [listToDelete, setListToDelete] = useState<UserListSummary | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [setPagination],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "lists", pagination.pageIndex, pagination.pageSize, debouncedSearch],
    queryFn: () => fetchUserLists(pagination.pageSize, pagination.pageIndex + 1, debouncedSearch || undefined, true),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const deleteMutation = useMutation({
    mutationFn: deleteList,
    onSuccess: () => {
      toast.success(t("admin:lists.deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "lists"] });
      setListToDelete(null);
    },
    onError: () => {
      toast.error(t("admin:lists.deleteError"));
    },
  });

  const lists = data?.data ?? [];
  const totalCount = data?.totalCount ?? 0;

  const handleDeleteClick = useCallback((list: UserListSummary) => setListToDelete(list), []);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: t("admin:lists.table.name"),
          size: 240,
          cell: ({ row }) => (
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              {row.original.description && <div className="truncate text-xs text-muted-foreground">{row.original.description}</div>}
            </div>
          ),
        }),
        columnHelper.accessor("createdBy", {
          header: t("admin:lists.table.createdBy"),
          size: 180,
          cell: ({ getValue }) => {
            const by = getValue();
            if (!by?.name) return <span className="text-muted-foreground italic text-xs">-</span>;
            return (
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={resolveAvatarUrl(by.image)} />
                  <AvatarFallback className="text-[10px]">{by.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{by.name}</div>
                  {by.username && <div className="truncate text-xs text-muted-foreground">@{by.username}</div>}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor("is_public", {
          header: t("admin:lists.table.visibility"),
          size: 110,
          cell: ({ getValue }) =>
            getValue() ? (
              <Badge variant="secondary" className="gap-1">
                <HugeiconsIcon icon={Globe02Icon} className="size-3" />
                {t("admin:lists.table.public")}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <HugeiconsIcon icon={LockIcon} className="size-3" />
                {t("admin:lists.table.private")}
              </Badge>
            ),
        }),
        columnHelper.accessor("stationCount", {
          header: t("admin:lists.table.stations"),
          size: 100,
          cell: ({ getValue }) => <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{getValue()}</span>,
        }),
        columnHelper.accessor("radiolineCount", {
          header: t("admin:lists.table.radiolines"),
          size: 110,
          cell: ({ getValue }) => <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{getValue()}</span>,
        }),
        columnHelper.accessor("createdAt", {
          header: t("common:labels.created"),
          size: 130,
          cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums text-xs">{formatShortDate(getValue(), i18n.language)}</span>,
        }),
        columnHelper.display({
          id: "actions",
          size: 56,
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(row.original);
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          ),
        }),
      ]),
    [t, i18n.language, handleDeleteClick],
  );

  const handleRowClick = useCallback((list: UserListSummary) => navigate({ to: `/lists/${list.uuid}` }), [navigate]);

  const table = useTable({
    features: appTableFeatures,
    data: lists,
    columns,
    manualPagination: true,
    pageCount: Math.ceil(totalCount / pagination.pageSize),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <>
      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("admin:breadcrumbs.lists")}</h1>
          </div>
          <div className={cn("relative w-full md:max-w-xs", hasFloatingRail && "max-md:hidden")}>
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            />
            <Input placeholder={t("common:placeholder.search")} value={search} onChange={handleSearchChange} className="pl-8" />
          </div>
        </div>

        <div ref={containerRef} className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="custom-scrollbar overflow-x-auto overflow-y-hidden">
            <DataTable.Root table={table} className="block rounded-b-none border-b-0">
              <DataTable.Table>
                <DataTable.Header />
                {isLoading ? (
                  <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} />
                ) : isError ? (
                  <tbody>
                    <tr>
                      <td colSpan={columns.length} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
                            <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
                          </div>
                          <p>{t("common:error.title")}</p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                ) : lists.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={columns.length} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <HugeiconsIcon icon={ListViewIcon} className="size-10 mb-2 opacity-20" />
                          <p className="font-medium">{t("admin:lists.table.empty")}</p>
                          <p className="text-sm opacity-70">{t("admin:lists.table.emptyHint")}</p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <DataTable.Body onRowClick={handleRowClick} />
                )}
              </DataTable.Table>
            </DataTable.Root>
          </div>
          <DataTable.PaginationFooter>
            <DataTablePagination table={table} totalItems={totalCount} pageSizeOptions={pageSizeOptions} />
          </DataTable.PaginationFooter>
        </div>
      </div>

      {hasFloatingRail && navActionTarget
        ? createPortal(
            <div className="flex items-center max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 md:hidden">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="mx-auto w-max">
                  <ListsMobileFilterRail
                    search={search}
                    onSearchChange={(value) => {
                      setSearch(value);
                      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                    }}
                  />
                </div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}

      <AlertDialog open={!!listToDelete} onOpenChange={(open) => !open && setListToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin:lists.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin:lists.confirmDeleteDesc", { name: listToDelete?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => listToDelete && deleteMutation.mutate(listToDelete.uuid)}
              disabled={deleteMutation.isPending}
            >
              {t("common:actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/lists/")({
  component: AdminListsPage,
  staticData: {
    titleKey: "breadcrumbs.lists",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
    allowedRoles: ["admin"],
  },
});
