import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type NewUser, createUser, showUserAdminError, storeUpdatedAccount } from "../../api/authAdmin";
import { getPasswordLengthProblem } from "../../utils/password";
import { USERNAME_MAX_LENGTH, getUsernameProblem, getUsernameProblemText } from "../../utils/username";
import { NewPasswordField } from "../shared/newPasswordField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const EMPTY_USER: NewUser = { name: "", username: "", email: "", password: "" };

type CreateUserFormProps = {
  isPending: boolean;
  onSubmit: (user: NewUser) => void;
  onCancel: () => void;
};

function CreateUserForm({ isPending, onSubmit, onCancel }: CreateUserFormProps) {
  const { t } = useTranslation(["admin", "auth", "common"]);
  const nameId = useId();
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const [draft, setDraft] = useState(EMPTY_USER);

  const user: NewUser = { name: draft.name.trim(), username: draft.username.trim(), email: draft.email.trim(), password: draft.password };
  const usernameProblem = user.username === "" ? null : getUsernameProblem(user.username, null);
  const canSubmit =
    user.name !== "" &&
    user.username !== "" &&
    user.email !== "" &&
    usernameProblem === null &&
    getPasswordLengthProblem(user.password) === null &&
    !isPending;

  function change(field: keyof NewUser, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(user);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("users.create.title")}</DialogTitle>
        <DialogDescription>{t("users.create.description")}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={nameId}>{t("auth:signUp.name")}</FieldLabel>
        <Input
          id={nameId}
          value={draft.name}
          onChange={(event) => change("name", event.target.value)}
          autoComplete="off"
          disabled={isPending}
          required
          autoFocus
        />
      </Field>
      <Field data-invalid={usernameProblem !== null || undefined}>
        <FieldLabel htmlFor={usernameId}>{t("common:labels.username")}</FieldLabel>
        <Input
          id={usernameId}
          value={draft.username}
          onChange={(event) => change("username", event.target.value)}
          maxLength={USERNAME_MAX_LENGTH}
          autoComplete="off"
          aria-invalid={usernameProblem !== null || undefined}
          disabled={isPending}
          required
        />
        {usernameProblem === null ? null : <FieldError>{getUsernameProblemText(t, usernameProblem)}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor={emailId}>{t("common:labels.email")}</FieldLabel>
        <Input
          id={emailId}
          type="email"
          value={draft.email}
          onChange={(event) => change("email", event.target.value)}
          autoComplete="off"
          disabled={isPending}
          required
        />
      </Field>
      <NewPasswordField
        id={passwordId}
        label={t("common:labels.password")}
        value={draft.password}
        onChange={(password) => change("password", password)}
        disabled={isPending}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner /> : null}
          {t("users.create.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (createdUser) => {
      storeUpdatedAccount(queryClient, createdUser);
      onOpenChange(false);
      toast.success(t("users.create.success"));
      void navigate({ to: "/admin/users/$id", params: { id: createdUser.id } });
    },
    onError: showUserAdminError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <CreateUserForm isPending={createMutation.isPending} onSubmit={(user) => createMutation.mutate(user)} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
