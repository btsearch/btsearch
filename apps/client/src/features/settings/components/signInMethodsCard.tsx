import { CheckmarkCircle02Icon, FingerPrintIcon, Link02Icon, LinkOffIcon, LockPasswordIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isPasskeyCancelError, readAuthError, showSettingsError } from "../authErrors";
import { accountInfoQueryOptions, linkedAccountsQueryOptions, passkeysQueryOptions, passwordStatusQueryOptions, unwrapAuth } from "../queries";
import { useSettingsErrorHandler } from "../reauth";
import { ConfirmDialog } from "./confirmDialog";
import type { SettingsUser } from "./identityBanner";
import { PasswordInput } from "./passwordInput";
import {
  SETTINGS_INLINE_FORM_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsIconTile,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  StatusBadge,
} from "./settingsPrimitives";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, APP_NAME, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/auth/socialProviders";

const PASSWORD_MIN_LENGTH = 8;

type LinkedAccount = { id: string; accountId: string; providerId: string };

function getAccountDisplayName(info: { user?: { email?: string | null; name?: string | null } | null; data?: unknown } | null | undefined) {
  const data = info?.data;
  if (typeof data === "object" && data !== null) {
    if ("login" in data && typeof data.login === "string" && data.login !== "") return data.login;
    if ("username" in data && typeof data.username === "string" && data.username !== "") return data.username;
  }
  return info?.user?.email ?? info?.user?.name ?? undefined;
}

function NewPasswordFields({
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  disabled,
}: {
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("settings");
  const passwordId = useId();
  const confirmationId = useId();
  const [passwordTouched, setPasswordTouched] = useState(false);
  const tooShort = passwordTouched && password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== password;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field data-invalid={tooShort || undefined}>
        <FieldLabel htmlFor={passwordId}>{t("common:password.new")}</FieldLabel>
        <PasswordInput
          id={passwordId}
          value={password}
          onChange={onPasswordChange}
          onBlur={() => setPasswordTouched(true)}
          autoComplete="new-password"
          placeholder={t("common:password.newPlaceholder")}
          invalid={tooShort}
          disabled={disabled}
        />
        {tooShort ? <FieldError>{t("common:password.tooShort")}</FieldError> : null}
      </Field>
      <Field data-invalid={mismatch || undefined}>
        <FieldLabel htmlFor={confirmationId}>{t("common:password.confirm")}</FieldLabel>
        <PasswordInput
          id={confirmationId}
          value={confirmation}
          onChange={onConfirmationChange}
          autoComplete="new-password"
          placeholder={t("security.password.confirmPasswordPlaceholder")}
          invalid={mismatch}
          disabled={disabled}
        />
        {mismatch ? <FieldError>{t("common:password.mismatch")}</FieldError> : null}
      </Field>
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const currentId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [currentInvalid, setCurrentInvalid] = useState(false);

  const changeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("security.password.changeSuccess"));
      onDone();
    },
    onError: (error) => {
      if (readAuthError(error).code === "INVALID_PASSWORD") {
        setCurrentInvalid(true);
        return;
      }
      showSettingsError(error);
    },
  });

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= PASSWORD_MIN_LENGTH && confirmation === newPassword && !changeMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) changeMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className={SETTINGS_INLINE_FORM_CLASS}>
      <Field data-invalid={currentInvalid || undefined}>
        <FieldLabel htmlFor={currentId}>{t("security.password.currentPassword")}</FieldLabel>
        <PasswordInput
          id={currentId}
          value={currentPassword}
          onChange={(value) => {
            setCurrentPassword(value);
            setCurrentInvalid(false);
          }}
          autoComplete="current-password"
          placeholder={t("security.password.currentPasswordPlaceholder")}
          invalid={currentInvalid}
          disabled={changeMutation.isPending}
        />
        {currentInvalid ? <FieldError>{t("security.password.invalidCurrent")}</FieldError> : null}
      </Field>
      <NewPasswordFields
        password={newPassword}
        confirmation={confirmation}
        onPasswordChange={setNewPassword}
        onConfirmationChange={setConfirmation}
        disabled={changeMutation.isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("security.password.rules")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={changeMutation.isPending} onClick={onDone}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {changeMutation.isPending ? <Spinner /> : null}
            {t("security.password.changeAction")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function SetPasswordFlow({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.passkey();
      if (error) throw error;
    },
    onSuccess: () => setVerified(true),
    onError: (error) => {
      if (!isPasskeyCancelError(error)) showSettingsError(error);
    },
  });

  const setMutation = useMutation({
    mutationFn: (password: string) =>
      fetchJson<void>(`${API_BASE}/account/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      }),
    onSuccess: () => {
      toast.success(t("security.password.setSuccess"));
      void queryClient.invalidateQueries({ queryKey: passwordStatusQueryOptions(userId).queryKey });
      void queryClient.invalidateQueries({ queryKey: linkedAccountsQueryOptions(userId).queryKey });
      onDone();
    },
    onError: showSettingsError,
  });

  if (!verified) {
    return (
      <div className={SETTINGS_INLINE_FORM_CLASS}>
        <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">{t("security.password.passkeyHint")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={verifyMutation.isPending} onClick={onDone}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" size="sm" disabled={verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>
            {verifyMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={FingerPrintIcon} data-icon="inline-start" aria-hidden="true" />}
            {verifyMutation.isPending ? t("common:actions.verifying") : t("security.password.verifyPasskey")}
          </Button>
        </div>
      </div>
    );
  }

  const canSubmit = newPassword.length >= PASSWORD_MIN_LENGTH && confirmation === newPassword && !setMutation.isPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) setMutation.mutate(newPassword);
      }}
      className={SETTINGS_INLINE_FORM_CLASS}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="size-3.5" />
        {t("security.password.passkeyVerified")}
      </p>
      <NewPasswordFields
        password={newPassword}
        confirmation={confirmation}
        onPasswordChange={setNewPassword}
        onConfirmationChange={setConfirmation}
        disabled={setMutation.isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("security.password.rules")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={setMutation.isPending} onClick={onDone}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {setMutation.isPending ? <Spinner /> : null}
            {setMutation.isPending ? t("security.password.setting") : t("security.password.setAction")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PasswordRow({ userId, hasPassword }: { userId: string; hasPassword: boolean }) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingsRow
        icon={LockPasswordIcon}
        title={t("common:labels.password")}
        description={hasPassword ? t("security.password.description") : t("security.password.missing")}
      >
        {open ? null : (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {hasPassword ? t("security.password.changeTitle") : t("security.password.setAction")}
          </Button>
        )}
      </SettingsRow>
      {open ? (
        hasPassword ? (
          <ChangePasswordForm onDone={() => setOpen(false)} />
        ) : (
          <SetPasswordFlow userId={userId} onDone={() => setOpen(false)} />
        )
      ) : null}
    </>
  );
}

function PasswordlessRow({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const { data: passkeys, isPending, isError } = useQuery(passkeysQueryOptions(user.id));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => fetchJson<void>(`${API_BASE}/account/password`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(t("security.passwordless.success"));
      void queryClient.invalidateQueries({ queryKey: passwordStatusQueryOptions(user.id).queryKey });
      void queryClient.invalidateQueries({ queryKey: linkedAccountsQueryOptions(user.id).queryKey });
    },
    onError: showSettingsError,
  });

  const hasPasskey = (passkeys?.length ?? 0) > 0;
  const twoFactorEnabled = user.twoFactorEnabled === true;
  const description = twoFactorEnabled
    ? t("security.passwordless.requiresTwoFactorOff")
    : isError
      ? t("security.passwordless.passkeysLoadFailed")
      : hasPasskey || isPending
        ? t("security.passwordless.description")
        : t("security.passwordless.requiresPasskey");

  return (
    <>
      <SettingsRow icon={FingerPrintIcon} title={t("security.passwordless.title")} description={description}>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!hasPasskey || twoFactorEnabled || removeMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {t("security.passwordless.remove")}
        </Button>
      </SettingsRow>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("security.passwordless.confirmTitle")}
        description={t("security.passwordless.confirmDescription")}
        confirmLabel={t("security.passwordless.remove")}
        pending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </>
  );
}

function PasswordRows({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const { data: hasPassword, isError, isFetching, refetch } = useQuery(passwordStatusQueryOptions(user.id));

  if (hasPassword !== undefined) {
    return (
      <>
        <PasswordRow userId={user.id} hasPassword={hasPassword} />
        {hasPassword ? <PasswordlessRow user={user} /> : null}
      </>
    );
  }
  if (isError) return <SettingsRowError title={t("common:error.actionFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />;
  return <SettingsRowSkeleton />;
}

function ProviderIconTile({ icon, muted = false }: { icon: IconSvgElement; muted?: boolean }) {
  return <SettingsIconTile icon={icon} className={muted ? "opacity-60" : "text-foreground"} />;
}

function LinkedAccountRow({
  account,
  provider,
  userId,
  canUnlink,
}: {
  account: LinkedAccount;
  provider: SocialProvider;
  userId: string;
  canUnlink: boolean;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const handleError = useSettingsErrorHandler();
  const { data: accountInfo } = useQuery(accountInfoQueryOptions(account.id));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unlinkMutation = useMutation({
    mutationFn: () => unwrapAuth(authClient.unlinkAccount({ accountId: account.id })),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(t("security.linked.unlinkSuccess", { provider: provider.label }));
      void queryClient.invalidateQueries({ queryKey: linkedAccountsQueryOptions(userId).queryKey });
    },
    onError: (error) => {
      setConfirmOpen(false);
      handleError(error);
    },
  });

  const displayName = getAccountDisplayName(accountInfo) ?? account.accountId;

  return (
    <>
      <SettingsRow
        media={<ProviderIconTile icon={provider.icon} />}
        title={provider.label}
        badge={<StatusBadge tone="success">{t("security.linked.connected")}</StatusBadge>}
        description={<span className="break-all">{t("security.linked.signedInAs", { name: displayName })}</span>}
      >
        <Button type="button" variant="outline" size="sm" disabled={!canUnlink || unlinkMutation.isPending} onClick={() => setConfirmOpen(true)}>
          <HugeiconsIcon icon={LinkOffIcon} data-icon="inline-start" aria-hidden="true" />
          {t("security.linked.disconnect")}
        </Button>
      </SettingsRow>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("security.linked.unlinkConfirmTitle", { provider: provider.label })}
        description={t("security.linked.unlinkConfirmDescription", { provider: provider.label })}
        confirmLabel={t("security.linked.disconnect")}
        pending={unlinkMutation.isPending}
        onConfirm={() => unlinkMutation.mutate()}
      />
    </>
  );
}

function ConnectProviderRow({ provider }: { provider: SocialProvider }) {
  const { t } = useTranslation("settings");

  const linkMutation = useMutation({
    mutationFn: () => unwrapAuth(authClient.linkSocial({ provider: provider.id, callbackURL: `${window.location.origin}/settings?tab=security` })),
    onSuccess: (data) => {
      if (data.url) window.location.assign(data.url);
    },
    onError: showSettingsError,
  });

  return (
    <SettingsRow
      media={<ProviderIconTile icon={provider.icon} muted />}
      title={provider.label}
      description={t("security.linked.connectHint", { provider: provider.label })}
    >
      <Button type="button" variant="outline" size="sm" disabled={linkMutation.isPending} onClick={() => linkMutation.mutate()}>
        {linkMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={Link02Icon} data-icon="inline-start" aria-hidden="true" />}
        {t("security.linked.connect")}
      </Button>
    </SettingsRow>
  );
}

function LinkedAccountRows({ userId }: { userId: string }) {
  const { t } = useTranslation("settings");
  const { data: accounts, isPending, isError, isFetching, refetch } = useQuery(linkedAccountsQueryOptions(userId));

  if (isPending) return SOCIAL_PROVIDERS.map((provider) => <SettingsRowSkeleton key={provider.id} />);
  if (isError || accounts === undefined)
    return <SettingsRowError title={t("security.linked.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />;

  const canUnlink = accounts.length > 1;

  return SOCIAL_PROVIDERS.flatMap((provider) => {
    const providerAccounts = accounts.filter((account) => account.providerId === provider.id);
    if (providerAccounts.length === 0) return [<ConnectProviderRow key={provider.id} provider={provider} />];
    return providerAccounts.map((account) => (
      <LinkedAccountRow key={account.id} account={account} provider={provider} userId={userId} canUnlink={canUnlink} />
    ));
  });
}

export function SignInMethodsCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("security.signIn.title")} description={t("security.signIn.description", { app: APP_NAME })} />
      <div className="border-t">
        <PasswordRows user={user} />
        <LinkedAccountRows userId={user.id} />
      </div>
    </SettingsCard>
  );
}
