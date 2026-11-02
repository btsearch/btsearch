import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { setUserPassword, showUserAdminError } from "../../api/authAdmin";
import { invalidateUserAdminQueries } from "../../api/queryKeys";
import type { AdminUser } from "../../types";
import { getAccountName } from "../../utils/identity";
import { getPasswordLengthProblem } from "../../utils/password";
import { NewPasswordField } from "../shared/newPasswordField";
import { DialogNote } from "./userDetailPrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type PasswordFormProps = {
  user: AdminUser;
  isPending: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

type PasswordDialogProps = {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function PasswordForm({ user, isPending, onSubmit, onCancel }: PasswordFormProps) {
  const { t } = useTranslation("admin");
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const canSubmit = getPasswordLengthProblem(password) === null && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(password);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("settings:security.password.setAction")}</DialogTitle>
        <DialogDescription>{t("users.detail.security.password.dialogDescription", { name: getAccountName(user) })}</DialogDescription>
      </DialogHeader>
      <NewPasswordField id={passwordId} label={t("common:password.new")} value={password} onChange={setPassword} disabled={isPending} />
      <DialogNote>{t("users.detail.security.password.sessionsNote")}</DialogNote>
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner /> : null}
          {t("settings:security.password.setAction")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PasswordDialog({ user, open, onOpenChange }: PasswordDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const passwordMutation = useMutation({
    mutationFn: (newPassword: string) => setUserPassword(user.id, newPassword),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateUserAdminQueries(queryClient, user.id);
      toast.success(t("settings:security.password.setSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!passwordMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <PasswordForm
          user={user}
          isPending={passwordMutation.isPending}
          onSubmit={(password) => passwordMutation.mutate(password)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
