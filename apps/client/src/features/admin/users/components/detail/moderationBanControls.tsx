import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showUserAdminError, storeUpdatedAccount, unbanUser } from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import { type BanDialogMode, ModerationBanDialog } from "./moderationBanDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ModerationBanControls({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<BanDialogMode>("ban");

  const unbanMutation = useMutation({
    mutationFn: () => unbanUser(user.id),
    onSuccess: (updatedUser) => {
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("users.detail.moderation.ban.unbanSuccess"));
    },
    onError: showUserAdminError,
  });

  function openDialog(mode: BanDialogMode) {
    setDialogMode(mode);
    setIsDialogOpen(true);
  }

  return (
    <>
      {user.isBanned ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={unbanMutation.isPending}
            onClick={() => openDialog("change")}
          >
            {t("users.detail.moderation.ban.change")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={unbanMutation.isPending}
            onClick={() => unbanMutation.mutate()}
          >
            {unbanMutation.isPending ? <Spinner /> : null}
            {t("users.detail.moderation.ban.unban")}
          </Button>
        </>
      ) : (
        <Button type="button" variant="destructive" size="sm" className="cursor-pointer" onClick={() => openDialog("ban")}>
          {t("users.detail.moderation.ban.action")}
        </Button>
      )}
      <ModerationBanDialog user={user} mode={dialogMode} open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
