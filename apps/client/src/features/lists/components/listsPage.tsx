import {
  Add01Icon,
  AirportTowerIcon,
  Calendar03Icon,
  Delete02Icon,
  Globe02Icon,
  MoreHorizontalCircle01Icon,
  PencilEdit02Icon,
  SecurityLockIcon,
  Share08Icon,
  SignalFull02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import type { UserListSummary } from "@/features/lists/api";
import { deleteList, updateList } from "@/features/lists/api";
import { useUserLists } from "@/features/lists/hooks/useUserLists";
import { useFavoriteLists } from "@/hooks/useFavoriteLists";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const CreateListDialog = lazy(() => import("./createListDialog").then((m) => ({ default: m.CreateListDialog })));

const ESTIMATED_CARD_HEIGHT = 112;

export function ListsPageContent() {
  const { t } = useTranslation(["lists", "common"]);
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useUserLists();
  const { canFavorite, isFavorite, toggleFavorite } = useFavoriteLists();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editState, setEditState] = useState<{ target: UserListSummary; name: string; description: string; notificationsEnabled: boolean } | null>(
    null,
  );

  const lists = useMemo<UserListSummary[]>(
    () => data?.pages.flatMap((p) => p.data).filter((l) => l.createdBy.uuid === session?.user?.id) ?? [],
    [data, session?.user?.id],
  );

  const parentRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    count: lists.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 5,
    gap: 12,
  });

  const items = virtualizer.getVirtualItems();

  const handleScroll = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= lists.length - 1) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, items, lists.length, fetchNextPage]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const deleteMutation = useMutation({
    mutationFn: deleteList,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:deleted"));
      setDeleteTarget(null);
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: ({ uuid, is_public }: { uuid: string; is_public: boolean }) => updateList(uuid, { is_public }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:updated"));
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({
      uuid,
      name,
      description,
      notificationsEnabled,
    }: {
      uuid: string;
      name: string;
      description?: string;
      notificationsEnabled: boolean;
    }) => updateList(uuid, { name, description, notificationsEnabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:updated"));
      setEditState(null);
    },
  });

  function openEdit(list: UserListSummary) {
    setEditState({ target: list, name: list.name, description: list.description ?? "", notificationsEnabled: list.notificationsEnabled });
  }

  function handleRename() {
    if (!editState || !editState.name.trim()) return;
    renameMutation.mutate({
      uuid: editState.target.uuid,
      name: editState.name.trim(),
      description: editState.description.trim() || undefined,
      notificationsEnabled: editState.notificationsEnabled,
    });
  }

  function handleShare(list: UserListSummary) {
    const url = `${window.location.origin}/lists/${list.uuid}`;
    void navigator.clipboard.writeText(url).then(() => toast.success(t("lists:copied")));
  }

  const navActionTarget = useNavActionTarget();

  return (
    <div className="max-w-4xl flex flex-col h-full">
      {navActionTarget &&
        createPortal(
          <Button onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            {t("lists:create")}
          </Button>,
          navActionTarget,
        )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">{t("lists:empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {items.map((virtualItem) => {
              const list = lists[virtualItem.index];
              const favorite = isFavorite(list.uuid);
              const favoriteLabel = favorite ? t("lists:removeFavorite") : t("lists:addFavorite");

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualItem.start}px)` }}
                >
                  <Card size="sm">
                    <CardContent className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link to={"/lists/$uuid"} params={{ uuid: list.uuid }} target="_blank" className="font-medium truncate hover:underline">
                            {list.name}
                          </Link>
                          {list.description && <p className="text-muted-foreground text-xs line-clamp-2">{list.description}</p>}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {canFavorite ? (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={favoriteLabel}
                              aria-pressed={favorite}
                              title={favoriteLabel}
                              className={cn(favorite && "text-amber-500 hover:text-amber-500 **:fill-current")}
                              onClick={() => toggleFavorite(list.uuid)}
                            >
                              <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
                            </Button>
                          ) : null}

                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
                              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(list)}>
                                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                                {t("lists:rename")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleShare(list)}>
                                <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
                                {t("common:actions.share")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => togglePublicMutation.mutate({ uuid: list.uuid, is_public: !list.is_public })}>
                                <HugeiconsIcon icon={list.is_public ? SecurityLockIcon : Globe02Icon} strokeWidth={2} />
                                {list.is_public ? t("lists:togglePrivate") : t("lists:togglePublic")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(list.uuid)}>
                                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                                {t("common:actions.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <HugeiconsIcon icon={AirportTowerIcon} className="size-3" />
                          {t("lists:stationCount", { count: list.stationCount })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <HugeiconsIcon icon={SignalFull02Icon} className="size-3" />
                          {t("lists:radiolineCount", { count: list.radiolineCount })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            list.is_public ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                          )}
                        >
                          <HugeiconsIcon icon={list.is_public ? Globe02Icon : SecurityLockIcon} className="size-3" />
                          {list.is_public ? t("lists:public") : t("lists:private")}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <HugeiconsIcon icon={Calendar03Icon} className="size-3" />
                          {new Date(list.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>

          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Spinner className="size-4" />
            </div>
          )}
        </div>
      )}

      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
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
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
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
            <label
              htmlFor="edit-list-notifications"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                editState?.notificationsEnabled ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <Checkbox
                id="edit-list-notifications"
                checked={editState?.notificationsEnabled ?? false}
                onCheckedChange={(checked) => {
                  setEditState((prev) => (prev ? { ...prev, notificationsEnabled: !!checked } : prev));
                }}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t("lists:notificationsEnabled")}</span>
                <span className="block text-xs text-muted-foreground">{t("lists:notificationsEnabledHint")}</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleRename} disabled={!editState?.name.trim() || renameMutation.isPending}>
              {renameMutation.isPending ? <Spinner /> : t("common:actions.save")}
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
