import { Alert02Icon, Delete02Icon, Mail01Icon, TriangleAlertIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, Suspense, lazy, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { readAuthError, showSettingsError } from "../authErrors";
import { linkedAccountsQueryOptions } from "../queries";
import { useSettingsErrorHandler } from "../reauth";
import { SETTINGS_SECTION_IDS } from "../sections";
import { ConfirmDialog } from "./confirmDialog";
import type { SettingsUser } from "./identityBanner";
import { PasswordInput } from "./passwordInput";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SETTINGS_INLINE_FORM_CLASS,
  SETTINGS_TWO_COLUMN_CLASS,
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsSection,
  SettingsStack,
  StatusBadge,
} from "./settingsPrimitives";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { USER_PROFILE_QUERY_KEY } from "@/features/user-profile/queries";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { getInitials, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const loadAvatarCropDialog = () => import("@/components/account/avatarCropDialog");
const AvatarCropDialog = lazy(() => loadAvatarCropDialog().then((module) => ({ default: module.AvatarCropDialog })));

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 25;
const RESERVED_USERNAMES = new Set(["admin", "administrator", "mod", "moderator"]);
const DISALLOWED_USERNAME_CHARACTERS = /[\s@/!#$%^&*()+={}[\]|\\:;"'<>,?]/;

type UsernameProblem = "length" | "invalid" | "reserved";

function accountSettingsUrl() {
  return `${window.location.origin}/settings?tab=account`;
}

function getUsernameProblem(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return "length";
  if (DISALLOWED_USERNAME_CHARACTERS.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "reserved";
  return null;
}

function AvatarControls({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append("file", blob, "avatar.jpg");
      const response = await fetchJson<{ data: { image: string } }>(`${API_BASE}/account/avatar`, { method: "POST", body: formData });
      const { error } = await authClient.updateUser({ image: response.data.image });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      toast.success(t("account.avatar.uploadSuccess"));
    },
    onError: showSettingsError,
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await fetchJson<void>(`${API_BASE}/account/avatar`, { method: "DELETE" });
      const { error } = await authClient.updateUser({ image: null });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmRemove(false);
      void queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      toast.success(t("account.avatar.removeSuccess"));
    },
    onError: showSettingsError,
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCropSource(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const isUploadedImage = typeof user.image === "string" && user.image !== "" && !user.image.startsWith("http");
  const isBusy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <div className="flex min-w-0 items-center gap-4">
      <Avatar className="size-16 shrink-0">
        <AvatarImage src={resolveAvatarUrl(user.image)} alt="" />
        <AvatarFallback className="text-lg">{getInitials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm leading-5 font-medium">{t("account.avatar.title")}</p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("account.avatar.hint")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              void loadAvatarCropDialog();
              fileInputRef.current?.click();
            }}
          >
            {uploadMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" aria-hidden="true" />}
            {uploadMutation.isPending ? t("account.avatar.uploading") : t("account.avatar.upload")}
          </Button>
          {isUploadedImage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
              onClick={() => setConfirmRemove(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden="true" />
              {t("common:actions.remove")}
            </Button>
          ) : null}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {cropSource !== null ? (
        <Suspense>
          <AvatarCropDialog
            open
            src={cropSource}
            onConfirm={(blob) => {
              setCropSource(null);
              uploadMutation.mutate(blob);
            }}
            onClose={() => setCropSource(null)}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("account.avatar.removeConfirmTitle")}
        description={t("account.avatar.removeConfirmDescription")}
        confirmLabel={t("common:actions.remove")}
        pending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </div>
  );
}

function AccountDetailsCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const formId = useId();
  const nameId = useId();
  const usernameId = useId();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftUsername, setDraftUsername] = useState<string | null>(null);
  const [takenUsername, setTakenUsername] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: { name?: string; username?: string }) => {
      const { error } = await authClient.updateUser(values);
      if (error) throw error;
    },
    onSuccess: (_result, values) => {
      if (values.name !== undefined) setDraftName(values.name);
      if (values.username !== undefined) setDraftUsername(values.username.toLowerCase());
      void queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      toast.success(t("account.details.saveSuccess"));
    },
    onError: (error, values) => {
      if (readAuthError(error).code === "USERNAME_IS_ALREADY_TAKEN" && values.username !== undefined) {
        setTakenUsername(values.username);
        return;
      }
      showSettingsError(error);
    },
  });

  const savedUsername = user.username ?? "";
  const name = draftName ?? user.name;
  const username = draftUsername ?? savedUsername;
  const trimmedName = name.trim();
  const trimmedUsername = username.trim();
  const nameChanged = trimmedName !== user.name;
  const usernameChanged = trimmedUsername !== savedUsername;
  const isDirty = nameChanged || usernameChanged;

  const usernameProblem = usernameChanged ? getUsernameProblem(trimmedUsername) : null;
  const nameError = trimmedName.length === 0 ? t("account.name.required") : null;
  const usernameError =
    usernameProblem === "length"
      ? t("account.username.length", { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
      : usernameProblem === "invalid"
        ? t("account.username.invalid")
        : usernameProblem === "reserved"
          ? t("account.username.reserved")
          : takenUsername !== null && takenUsername === trimmedUsername
            ? t("account.username.taken")
            : null;

  const canSave = isDirty && nameError === null && usernameError === null && !saveMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({
      ...(nameChanged ? { name: trimmedName } : {}),
      ...(usernameChanged ? { username: trimmedUsername } : {}),
    });
  };

  const discard = () => {
    setDraftName(null);
    setDraftUsername(null);
    setTakenUsername(null);
  };

  const profileUrl = `${window.location.host}/users/${trimmedUsername || savedUsername}`;

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("account.details.title")} description={t("account.details.description")} />
      <div className="flex flex-wrap items-center gap-x-12 gap-y-5 border-t px-4 py-5 sm:px-5">
        <AvatarControls user={user} />
        <div className="@container min-w-0 flex-[1_1_28rem]">
          <form id={formId} onSubmit={handleSubmit} className="grid gap-4 @md:grid-cols-2">
            <Field data-invalid={nameError !== null || undefined}>
              <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setDraftName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                disabled={saveMutation.isPending}
                aria-invalid={nameError !== null || undefined}
              />
              {nameError !== null ? <FieldError>{nameError}</FieldError> : <FieldDescription>{t("account.name.hint")}</FieldDescription>}
            </Field>
            <Field data-invalid={usernameError !== null || undefined}>
              <FieldLabel htmlFor={usernameId}>{t("common:labels.username")}</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>@</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id={usernameId}
                  value={username}
                  onChange={(event) => setDraftUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={USERNAME_MAX_LENGTH}
                  disabled={saveMutation.isPending}
                  aria-invalid={usernameError !== null || undefined}
                />
              </InputGroup>
              {usernameError !== null ? (
                <FieldError>{usernameError}</FieldError>
              ) : (
                <FieldDescription className="truncate">{t("account.username.hint", { url: profileUrl })}</FieldDescription>
              )}
            </Field>
          </form>
        </div>
      </div>
      <SettingsCardFooter>
        <p className="text-xs text-muted-foreground">{t("account.username.rules", { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" disabled={!isDirty || saveMutation.isPending} onClick={discard}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!canSave}>
            {saveMutation.isPending ? <Spinner /> : null}
            {t("common:actions.saveChanges")}
          </Button>
        </div>
      </SettingsCardFooter>
    </SettingsCard>
  );
}

function EmailCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation(["settings", "common"]);
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const changeMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.changeEmail({ newEmail: email, callbackURL: accountSettingsUrl() });
      if (error) throw error;
    },
    onSuccess: () => {
      setIsEditing(false);
      setNewEmail("");
      toast.success(t("account.email.changeSuccess"));
    },
    onError: showSettingsError,
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: accountSettingsUrl() });
      if (error) throw error;
    },
    onSuccess: () => toast.success(t("account.emailVerification.resendSuccess")),
    onError: (error) => {
      if (readAuthError(error).code === "VERIFICATION_EMAIL_RATE_LIMITED") {
        toast.error(t("account.emailVerification.rateLimited"));
        return;
      }
      showSettingsError(error);
    },
  });

  const trimmedEmail = newEmail.trim();
  const isSameAddress = trimmedEmail.toLowerCase() === user.email.toLowerCase();

  const cancelEditing = () => {
    setIsEditing(false);
    setNewEmail("");
  };

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={Mail01Icon}
        title={<span className="break-all">{user.email}</span>}
        badge={
          user.emailVerified ? (
            <StatusBadge tone="success">{t("account.email.verified")}</StatusBadge>
          ) : (
            <StatusBadge tone="warning" icon={Alert02Icon}>
              {t("account.email.unverified")}
            </StatusBadge>
          )
        }
        description={user.emailVerified ? t("account.email.description") : t("account.emailVerification.unverifiedDescription")}
        action={
          isEditing ? null : (
            <>
              {user.emailVerified ? null : (
                <Button type="button" variant="ghost" size="sm" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate()}>
                  {resendMutation.isPending ? <Spinner /> : null}
                  {resendMutation.isPending ? t("account.emailVerification.resending") : t("account.emailVerification.resend")}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                {t("account.email.change")}
              </Button>
            </>
          )
        }
      />
      {isEditing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedEmail && !isSameAddress) changeMutation.mutate(trimmedEmail);
          }}
          className={SETTINGS_INLINE_FORM_CLASS}
        >
          <Field data-invalid={isSameAddress || undefined}>
            <FieldLabel htmlFor={inputId}>{t("account.email.newLabel")}</FieldLabel>
            <Input
              id={inputId}
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder={t("account.email.newPlaceholder")}
              autoComplete="email"
              required
              disabled={changeMutation.isPending}
              aria-invalid={isSameAddress || undefined}
            />
            {isSameAddress ? (
              <FieldError>{t("account.email.sameAddress")}</FieldError>
            ) : (
              <FieldDescription>{t("account.email.hint")}</FieldDescription>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={changeMutation.isPending} onClick={cancelEditing}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!trimmedEmail || isSameAddress || changeMutation.isPending}>
              {changeMutation.isPending ? <Spinner /> : null}
              {t("account.email.submit")}
            </Button>
          </div>
        </form>
      ) : null}
    </SettingsCard>
  );
}

function DeleteAccountCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation(["settings", "common"]);
  const passwordId = useId();
  const { data: accounts } = useQuery(linkedAccountsQueryOptions(user.id));
  const handleError = useSettingsErrorHandler();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async (confirmation: { password?: string }) => {
      const { error } = await authClient.deleteUser(confirmation);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setPassword("");
      toast.success(t("account.delete.success"));
      window.location.assign("/");
    },
    onError: (error) => {
      setPassword("");
      if (readAuthError(error).code === "SESSION_EXPIRED") setOpen(false);
      handleError(error);
    },
  });

  const needsPassword = accounts?.some((account) => account.providerId === "credential") ?? false;

  const handleOpenChange = (nextOpen: boolean) => {
    if (deleteMutation.isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) setPassword("");
  };

  return (
    <SettingsCard tone="destructive">
      <SettingsCardHeader
        icon={Delete02Icon}
        iconTone="destructive"
        title={t("account.delete.title")}
        description={t("account.delete.description")}
        action={
          <Button type="button" variant="destructive" size="sm" disabled={accounts === undefined} onClick={() => setOpen(true)}>
            {t("account.delete.title")}
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              deleteMutation.mutate(needsPassword ? { password } : {});
            }}
            className="flex flex-col gap-6"
          >
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
                <HugeiconsIcon icon={TriangleAlertIcon} />
              </AlertDialogMedia>
              <AlertDialogTitle>{t("account.delete.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("account.delete.confirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            {needsPassword ? (
              <Field>
                <FieldLabel htmlFor={passwordId}>{t("common:labels.password")}</FieldLabel>
                <PasswordInput
                  id={passwordId}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  placeholder={t("common:password.placeholder")}
                  disabled={deleteMutation.isPending}
                  required
                />
              </Field>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={deleteMutation.isPending || (needsPassword && password.length === 0)}>
                {deleteMutation.isPending ? <Spinner /> : null}
                {t("account.delete.title")}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}

export function AccountSection({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.account} title={t("sections.account")}>
      <SettingsStack>
        <AccountDetailsCard user={user} />
        <div className={SETTINGS_TWO_COLUMN_CLASS}>
          <EmailCard user={user} />
          <DeleteAccountCard user={user} />
        </div>
      </SettingsStack>
    </SettingsSection>
  );
}
