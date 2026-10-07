import type { List } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { discardDeletedListQueries } from "../api";
import { ListOwnerLine } from "./adminListsCells";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteList } from "@/features/lists/api";
import { showApiError } from "@/lib/api";

type AdminListDeleteDialogProps = {
  list: List;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ListContents({ list }: { list: List }) {
  const { t } = useTranslation(["admin", "common", "lists"]);
  const { stations, officialSites, microwaveLinks } = list.itemCounts;
  const parts: string[] = [];
  if (stations > 0) parts.push(t("common:labels.stations", { count: stations }));
  if (officialSites > 0) parts.push(t("admin:lists.contents.officialSites", { count: officialSites }));
  if (microwaveLinks > 0) parts.push(t("lists:radiolineCount", { count: microwaveLinks }));

  return <p className="text-xs text-muted-foreground">{parts.length === 0 ? t("lists:emptyList") : parts.join(", ")}</p>;
}

export function AdminListDeleteDialog({ list, open, onOpenChange }: AdminListDeleteDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteList(list.id),
    onSuccess: () => {
      onOpenChange(false);
      void discardDeletedListQueries(queryClient, list.id);
      toast.success(t("admin:lists.deleteSuccess"));
    },
    onError: showApiError,
  });

  function deleteShownList() {
    if (open) deleteMutation.mutate();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deleteMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("admin:lists.confirmDeleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("admin:lists.confirmDeleteDesc", { name: list.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-medium wrap-anywhere">{list.name}</p>
          <ListOwnerLine owner={list.owner} />
          <ListContents list={list} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
          <Button variant="destructive" className="cursor-pointer" disabled={deleteMutation.isPending} onClick={deleteShownList}>
            {deleteMutation.isPending ? <Spinner /> : null}
            {t("common:actions.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
