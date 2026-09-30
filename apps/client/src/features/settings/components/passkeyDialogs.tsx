import { FingerPrintIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isFreshSessionError, isPasskeyCancelError, readAuthError, showSettingsError } from "../authErrors";
import { passkeysQueryOptions, unwrapAuth } from "../queries";
import { useSettingsErrorHandler } from "../reauth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";

const PASSKEY_NAME_MAX_LENGTH = 64;

export type SettingsPasskey = {
  id: string;
  name?: string | null;
  createdAt: Date | string;
};

export function AddPasskeyDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const handleError = useSettingsErrorHandler();
  const nameId = useId();
  const [name, setName] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setName("");
  };

  const addMutation = useMutation({
    mutationFn: (passkeyName: string) => unwrapAuth(authClient.passkey.addPasskey(passkeyName ? { name: passkeyName } : undefined)),
    onSuccess: () => {
      toast.success(t("security.passkeys.addSuccess"));
      void queryClient.invalidateQueries({ queryKey: passkeysQueryOptions(userId).queryKey });
      handleOpenChange(false);
    },
    onError: (error) => {
      if (isPasskeyCancelError(error)) return;
      if (readAuthError(error).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        toast.error(t("security.passkeys.alreadyAdded"));
        return;
      }
      if (isFreshSessionError(error)) handleOpenChange(false);
      handleError(error);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addMutation.mutate(name.trim());
          }}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={FingerPrintIcon} aria-hidden="true" className="size-5" />
              {t("security.passkeys.add")}
            </DialogTitle>
            <DialogDescription>{t("security.passkeys.addDescription")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("common:placeholder.optional")}
              maxLength={PASSKEY_NAME_MAX_LENGTH}
              autoComplete="off"
              disabled={addMutation.isPending}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={addMutation.isPending} onClick={() => handleOpenChange(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? <Spinner /> : null}
              {t("security.passkeys.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenamePasskeyDialog({ passkey, userId, onClose }: { passkey: SettingsPasskey; userId: string; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState(passkey.name ?? "");

  const renameMutation = useMutation({
    mutationFn: (nextName: string) => unwrapAuth(authClient.passkey.updatePasskey({ id: passkey.id, name: nextName })),
    onSuccess: () => {
      toast.success(t("security.passkeys.renameSuccess"));
      void queryClient.invalidateQueries({ queryKey: passkeysQueryOptions(userId).queryKey });
      onClose();
    },
    onError: showSettingsError,
  });

  const trimmedName = name.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !renameMutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName) renameMutation.mutate(trimmedName);
          }}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle>{t("security.passkeys.renameTitle")}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={PASSKEY_NAME_MAX_LENGTH}
              autoComplete="off"
              required
              disabled={renameMutation.isPending}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={renameMutation.isPending} onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!trimmedName || renameMutation.isPending}>
              {renameMutation.isPending ? <Spinner /> : null}
              {t("common:actions.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
