import { Cancel01Icon, FilterIcon, Search01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import type { LightboxPhoto } from "@/components/photos/lightbox";
import { Lightbox } from "@/components/photos/lightbox";
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
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavActionTarget } from "@/contexts/navActions";
import { CommentsDataTable } from "@/features/admin/comments/components/commentsDataTable";
import type { AdminComment } from "@/features/admin/comments/types";
import { UserPicker } from "@/features/admin/users/components/UserPicker";
import { UserPickerPopover } from "@/features/admin/users/components/UserPickerPopover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson, showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMPTY_COMMENTS: AdminComment[] = [];
const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};

type CommentsStatusFilter = "all" | "pending" | "approved";

function CommentsMobileFilterRail({
  search,
  statusFilter,
  selectedAuthorIds,
  onSearchChange,
  onStatusChange,
  onAuthorsChange,
}: {
  search: string;
  statusFilter: CommentsStatusFilter;
  selectedAuthorIds: string[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: CommentsStatusFilter) => void;
  onAuthorsChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const hasSearch = search.trim().length > 0;
  const hasActiveFilters = hasSearch || statusFilter !== "all" || selectedAuthorIds.length > 0;
  const statusOptions: { value: CommentsStatusFilter; label: string }[] = [
    { value: "all", label: t("comments.filters.allStatuses") },
    { value: "pending", label: t("comments.filters.pending") },
    { value: "approved", label: t("comments.filters.approved") },
  ];

  const handleClearAll = () => {
    onSearchChange("");
    onStatusChange("all");
    onAuthorsChange([]);
  };

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={tCommon("labels.search")}>
        <MobileFilterPanelTitle>{tCommon("labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={tCommon("placeholder.search")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={statusFilter !== "all"} icon={FilterIcon} label={t("comments.filters.labelStatus")}>
        <MobileFilterPanelTitle>{t("comments.filters.labelStatus")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusChange(option.value)}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                statusFilter === option.value ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={selectedAuthorIds.length > 0} count={selectedAuthorIds.length} icon={UserIcon} label={t("comments.table.author")}>
        <MobileFilterPanelTitle>{t("comments.table.author")}</MobileFilterPanelTitle>
        <UserPicker selectedUserIds={selectedAuthorIds} onSelectionChange={onAuthorsChange} />
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleClearAll}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {tCommon("actions.clearAll")}
        </button>
      ) : null}
    </div>
  );
}

function AdminCommentsPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const navActionTarget = useNavActionTarget();
  const hasFloatingRail = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<CommentsStatusFilter>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "id">("createdAt");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [selectedAuthorIds, setSelectedAuthorIds] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<AdminComment | null>(null);
  const [editTarget, setEditTarget] = useState<AdminComment | null>(null);
  const [editContent, setEditContent] = useState("");

  const [lightboxComment, setLightboxComment] = useState<AdminComment | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-comments", pagination.pageIndex, pagination.pageSize, debouncedSearch, statusFilter, sortBy, sort, selectedAuthorIds],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pagination.pageSize),
        offset: String(pagination.pageIndex * pagination.pageSize),
        sortBy,
        sort,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (selectedAuthorIds.length > 0) params.set("author_ids", selectedAuthorIds.join(","));
      return fetchJson<{ data: AdminComment[]; totalCount: number }>(`${API_BASE}/comments?${params}`).then(
        (res) => res ?? { data: [], totalCount: 0 },
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (comment: AdminComment) => {
      const response = await fetch(`${API_BASE}/stations/${comment.station_id}/comments/${comment.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success(t("comments.deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      setDeleteTarget(null);
    },
    onError: showApiError,
  });

  const approveMutation = useMutation({
    mutationFn: async (comment: AdminComment) => {
      const response = await fetch(`${API_BASE}/stations/${comment.station_id}/comments/${comment.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      if (!response.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      toast.success(t("comments.approveSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
    },
    onError: showApiError,
  });

  const editMutation = useMutation({
    mutationFn: async ({ comment, content }: { comment: AdminComment; content: string }) => {
      const response = await fetch(`${API_BASE}/stations/${comment.station_id}/comments/${comment.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      toast.success(t("comments.editSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      setEditTarget(null);
    },
    onError: showApiError,
  });

  const handleEdit = useCallback((comment: AdminComment) => {
    setEditTarget(comment);
    setEditContent(comment.content);
  }, []);

  const handleDelete = useCallback((comment: AdminComment) => {
    setDeleteTarget(comment);
  }, []);

  const handleOpenLightbox = useCallback((comment: AdminComment, index: number) => {
    setLightboxComment(comment);
    setLightboxIndex(index);
  }, []);

  const lightboxPhotos = useMemo<LightboxPhoto[]>(
    () =>
      (lightboxComment?.attachments ?? []).map((att) => ({
        attachment_uuid: att.uuid,
        note: null,
        createdAt: lightboxComment?.createdAt ?? "",
        author: lightboxComment?.author
          ? {
              uuid: lightboxComment.author.id,
              username: lightboxComment.author.username ?? lightboxComment.author.name,
              name: lightboxComment.author.name,
            }
          : null,
      })),
    [lightboxComment],
  );

  const handleCloseLightbox = useCallback(() => setLightboxIndex(null), []);
  const handlePrevLightbox = useCallback(() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i)), []);
  const handleNextLightbox = useCallback(
    () => setLightboxIndex((i) => (i !== null && i < lightboxPhotos.length - 1 ? i + 1 : i)),
    [lightboxPhotos.length],
  );

  const handleSort = useCallback(
    (col: "createdAt" | "id") => {
      setSortBy(col);
      setSort((prev) => (sortBy === col ? (prev === "desc" ? "asc" : "desc") : "desc"));
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    [sortBy, setPagination],
  );

  return (
    <>
      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
        <div className={cn("flex items-end gap-2", hasFloatingRail && "max-md:hidden")}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{t("comments.filters.labelStatus")}</label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue>{statusFilter === "all" ? t("comments.filters.allStatuses") : t(`comments.filters.${statusFilter}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-40">
                <SelectItem value="all">{t("comments.filters.allStatuses")}</SelectItem>
                <SelectItem value="pending">{t("comments.filters.pending")}</SelectItem>
                <SelectItem value="approved">{t("comments.filters.approved")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{t("comments.table.author")}</label>
            <UserPickerPopover
              selectedUserIds={selectedAuthorIds}
              onSelectionChange={(ids) => {
                setSelectedAuthorIds(ids);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
          </div>
          <div className="flex max-w-sm flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{tCommon("labels.search")}</label>
            <div className="relative">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t("common:placeholder.search")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                className="pl-8"
              />
            </div>
          </div>
        </div>
        <CommentsDataTable
          data={data?.data ?? EMPTY_COMMENTS}
          isLoading={isLoading}
          total={data?.totalCount ?? 0}
          containerRef={containerRef}
          pagination={pagination}
          setPagination={setPagination}
          pageSizeOptions={pageSizeOptions}
          sortBy={sortBy}
          sort={sort}
          onSort={handleSort}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onApprove={approveMutation.mutate}
          onOpenLightbox={handleOpenLightbox}
        />
      </div>

      {hasFloatingRail && navActionTarget
        ? createPortal(
            <div className="flex items-center max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 md:hidden">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="mx-auto w-max">
                  <CommentsMobileFilterRail
                    search={search}
                    statusFilter={statusFilter}
                    selectedAuthorIds={selectedAuthorIds}
                    onSearchChange={(value) => {
                      setSearch(value);
                      setPagination((p) => ({ ...p, pageIndex: 0 }));
                    }}
                    onStatusChange={(value) => {
                      setStatusFilter(value);
                      setPagination((p) => ({ ...p, pageIndex: 0 }));
                    }}
                    onAuthorsChange={(ids) => {
                      setSelectedAuthorIds(ids);
                      setPagination((p) => ({ ...p, pageIndex: 0 }));
                    }}
                  />
                </div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("comments.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("comments.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {t("common:actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("comments.editTitle")}</DialogTitle>
          </DialogHeader>
          <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-32 resize-none" maxLength={10000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={() => editTarget && editMutation.mutate({ comment: editTarget, content: editContent })}
              disabled={editMutation.isPending || !editContent.trim()}
            >
              {tCommon("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Lightbox photos={lightboxPhotos} index={lightboxIndex} onClose={handleCloseLightbox} onPrev={handlePrevLightbox} onNext={handleNextLightbox} />
    </>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/comments/")({
  component: AdminCommentsPage,
  staticData: {
    titleKey: "breadcrumbs.comments",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", i18nNamespace: "admin" }],
    allowedRoles: ["admin", "editor"],
  },
});
