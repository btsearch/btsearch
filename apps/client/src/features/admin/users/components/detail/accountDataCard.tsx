import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AUTH_ERROR_CODES,
  type AdminUserChanges,
  hasAuthErrorCode,
  removeUserAvatar,
  showUserAdminError,
  storeUpdatedAccount,
  updateUserFields,
} from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import { getAccountName, isUploadedAvatar } from "../../utils/identity";
import { UserAvatar } from "@/components/app/userAvatar";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SETTINGS_DESCRIPTION_CLASS, SettingsCard, SettingsCardFooter, SettingsCardHeader } from "@/features/settings/components/settingsPrimitives";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

const NAME_MAX_LENGTH = 100;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 25;
const BIO_MAX_LENGTH = 500;
const RESERVED_USERNAMES = new Set(["admin", "administrator", "mod", "moderator"]);
const DISALLOWED_USERNAME_CHARACTERS = /[\s@/!#$%^&*()+={}[\]|\\:;"'<>,?]/;
const BIO_LINK_PATTERN = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i;
const FORM_AVATAR_CLASS = "size-16 *:data-[slot=avatar-fallback]:text-lg";

type AccountDraft = { name: string; username: string; bio: string };
type UsernameProblem = "length" | "invalid" | "reserved" | "taken";

function toAccountDraft(user: AdminUser): AccountDraft {
  return { name: user.name.trim(), username: (user.username ?? "").trim(), bio: (user.bio ?? "").trim() };
}

function getUsernameProblem(username: string, takenUsername: string | null): UsernameProblem | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return "length";
  if (DISALLOWED_USERNAME_CHARACTERS.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "reserved";
  if (takenUsername !== null && takenUsername.toLowerCase() === username.toLowerCase()) return "taken";
  return null;
}

function getUsernameProblemText(t: TFunction, problem: UsernameProblem): string {
  if (problem === "length") return t("settings:account.username.length", { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH });
  if (problem === "invalid") return t("settings:account.username.invalid");
  if (problem === "reserved") return t("settings:account.username.reserved");
  return t("settings:account.username.taken");
}

function AccountAvatarRow({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => removeUserAvatar(user.id),
    onSuccess: (updatedUser) => {
      setIsConfirmOpen(false);
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("settings:account.avatar.removeSuccess"));
    },
    onError: showUserAdminError,
  });

  const accountName = getAccountName(user);
  const isUploaded = isUploadedAvatar(user.image);
  let avatarSource: string;
  if (isUploaded) avatarSource = t("users.detail.account.data.avatar.uploaded");
  else if (user.image) avatarSource = t("users.detail.account.data.avatar.external");
  else avatarSource = t("users.detail.account.data.avatar.none");

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
      <UserAvatar user={{ name: accountName, image: user.image }} className={FORM_AVATAR_CLASS} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm leading-5 font-medium">{t("settings:account.avatar.title")}</p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{avatarSource}</p>
      </div>
      {isUploaded ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          disabled={removeMutation.isPending}
          onClick={() => setIsConfirmOpen(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden="true" />
          {t("users.detail.account.data.avatar.remove")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!removeMutation.isPending) setIsConfirmOpen(open);
        }}
        title={t("settings:account.avatar.removeConfirmTitle")}
        description={t("users.detail.account.data.avatar.removeConfirmDescription", { name: accountName })}
        confirmLabel={t("common:actions.remove")}
        pending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </div>
  );
}

export function AccountDataCard({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const formId = useId();
  const nameId = useId();
  const usernameId = useId();
  const bioId = useId();
  const [baseline, setBaseline] = useState(() => toAccountDraft(user));
  const [draft, setDraft] = useState(baseline);
  const [takenUsername, setTakenUsername] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (changes: AdminUserChanges) => updateUserFields(user.id, changes),
    onSuccess: (updatedUser) => {
      const savedDraft = toAccountDraft(updatedUser);
      setBaseline(savedDraft);
      setDraft(savedDraft);
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("settings:account.details.saveSuccess"));
    },
    onError: (error, changes) => {
      if (hasAuthErrorCode(error, AUTH_ERROR_CODES.usernameTaken) && changes.username !== undefined) {
        setTakenUsername(changes.username);
        return;
      }
      showUserAdminError(error);
    },
  });

  function updateDraft(patch: Partial<AccountDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const name = draft.name.trim();
  const username = draft.username.trim();
  const bio = draft.bio.trim();
  const isNameChanged = name !== baseline.name;
  const isUsernameChanged = username.toLowerCase() !== baseline.username.toLowerCase();
  const isBioChanged = bio !== baseline.bio;
  const isDirty = isNameChanged || isUsernameChanged || isBioChanged;

  const nameError = isNameChanged && name === "" ? t("settings:account.name.required") : null;
  const usernameProblem = isUsernameChanged ? getUsernameProblem(username, takenUsername) : null;
  const usernameError = usernameProblem === null ? null : getUsernameProblemText(t, usernameProblem);
  const bioError = isBioChanged && BIO_LINK_PATTERN.test(bio) ? t("settings:profile.bio.noLinks") : null;
  const canSave = isDirty && nameError === null && usernameError === null && bioError === null && !saveMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    const changes: AdminUserChanges = {};
    if (isNameChanged) changes.name = name;
    if (isUsernameChanged) changes.username = username;
    if (isBioChanged) changes.bio = bio === "" ? null : bio;
    saveMutation.mutate(changes);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("settings:account.details.title")} description={t("users.detail.account.data.description")} />
      <div className="flex flex-col gap-4 border-t px-4 py-5 sm:px-5">
        <AccountAvatarRow user={user} />
        <form id={formId} onSubmit={handleSubmit} className="@container flex flex-col gap-4">
          <div className="grid gap-4 @md:grid-cols-2">
            <Field data-invalid={nameError !== null || undefined}>
              <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
              <Input
                id={nameId}
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                {...NO_AUTOFILL_PROPS}
                maxLength={NAME_MAX_LENGTH}
                disabled={saveMutation.isPending}
                aria-invalid={nameError !== null || undefined}
              />
              {nameError === null ? null : <FieldError>{nameError}</FieldError>}
            </Field>
            <Field data-invalid={usernameError !== null || undefined}>
              <FieldLabel htmlFor={usernameId}>{t("common:labels.username")}</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>@</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id={usernameId}
                  value={draft.username}
                  onChange={(event) => updateDraft({ username: event.target.value })}
                  {...NO_AUTOFILL_PROPS}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={USERNAME_MAX_LENGTH}
                  disabled={saveMutation.isPending}
                  aria-invalid={usernameError !== null || undefined}
                />
              </InputGroup>
              {usernameError === null ? null : <FieldError>{usernameError}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={bioError !== null || undefined}>
            <div className="flex items-center justify-between gap-4">
              <FieldLabel htmlFor={bioId}>{t("common:labels.aboutMe")}</FieldLabel>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {draft.bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id={bioId}
              value={draft.bio}
              onChange={(event) => updateDraft({ bio: event.target.value })}
              {...NO_AUTOFILL_PROPS}
              maxLength={BIO_MAX_LENGTH}
              rows={2}
              disabled={saveMutation.isPending}
              aria-invalid={bioError !== null || undefined}
              className="min-h-17 resize-y"
            />
            {bioError === null ? null : <FieldError>{bioError}</FieldError>}
          </Field>
        </form>
      </div>
      <SettingsCardFooter className="mt-auto">
        <p className="text-xs text-muted-foreground">{t("users.detail.account.data.changedOnly")}</p>
        <Button type="submit" form={formId} size="sm" disabled={!canSave}>
          {saveMutation.isPending ? <Spinner /> : null}
          {saveMutation.isPending ? t("common:actions.saving") : t("common:actions.saveChanges")}
        </Button>
      </SettingsCardFooter>
    </SettingsCard>
  );
}
