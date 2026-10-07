import { CheckmarkCircle02Icon, Mail01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resendVerificationEmail } from "../../api/account";
import { changeUserEmail, showUserAdminError, storeUpdatedAccount, updateUserFields } from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import { UserStatusBadge } from "../shared/userStatusBadge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  SETTINGS_INLINE_FORM_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsRow,
  StatusBadge,
} from "@/features/settings/components/settingsPrimitives";
import { useResendCooldown } from "@/lib/auth/useResendCooldown";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type UnverifiedEmailActionsProps = {
  user: AdminUser;
  cooldown: number;
  onResent: () => void;
};

type EmailChangeFormProps = {
  user: AdminUser;
  onCancel: () => void;
  onChanged: () => void;
};

function UnverifiedEmailActions({ user, cooldown, onResent }: UnverifiedEmailActionsProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const resendMutation = useMutation({
    mutationFn: () => resendVerificationEmail(user.id),
    onSuccess: () => {
      onResent();
      toast.success(t("settings:account.emailVerification.resendSuccess"));
    },
    onError: showUserAdminError,
  });

  const verifyMutation = useMutation({
    mutationFn: () => updateUserFields(user.id, { isEmailVerified: true }),
    onSuccess: (updatedUser) => {
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("users.detail.account.email.markVerifiedSuccess"));
    },
    onError: showUserAdminError,
  });

  const isCoolingDown = cooldown > 0;
  let resendLabel: string;
  if (resendMutation.isPending) resendLabel = t("settings:account.emailVerification.resending");
  else if (isCoolingDown) resendLabel = t("users.detail.account.email.resendIn", { seconds: cooldown });
  else resendLabel = t("settings:account.emailVerification.resend");

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-3.5 sm:pr-5 sm:pl-[4.125rem]">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        disabled={resendMutation.isPending || isCoolingDown}
        onClick={() => resendMutation.mutate()}
      >
        {resendMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={Mail01Icon} data-icon="inline-start" aria-hidden="true" />}
        {resendLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        disabled={verifyMutation.isPending}
        onClick={() => verifyMutation.mutate()}
      >
        {verifyMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden="true" />}
        {t("users.detail.account.email.markVerified")}
      </Button>
    </div>
  );
}

function EmailChangeForm({ user, onCancel, onChanged }: EmailChangeFormProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const inputId = useId();
  const [newEmail, setNewEmail] = useState("");

  const changeMutation = useMutation({
    mutationFn: (email: string) => changeUserEmail(user.id, email),
    onSuccess: (updatedUser) => {
      onChanged();
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("users.detail.account.email.changeSuccess"));
    },
    onError: showUserAdminError,
  });

  const email = newEmail.trim();
  const isSameAddress = email !== "" && email.toLowerCase() === user.email.toLowerCase();
  const canSave = email !== "" && !isSameAddress && !changeMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSave) changeMutation.mutate(email);
  }

  return (
    <form onSubmit={handleSubmit} className={SETTINGS_INLINE_FORM_CLASS}>
      <Field data-invalid={isSameAddress || undefined}>
        <FieldLabel htmlFor={inputId}>{t("settings:account.email.newLabel")}</FieldLabel>
        <Input
          id={inputId}
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder={t("common:placeholder.email")}
          {...NO_AUTOFILL_PROPS}
          required
          disabled={changeMutation.isPending}
          aria-invalid={isSameAddress || undefined}
        />
        {isSameAddress ? (
          <FieldError>{t("users.detail.account.email.sameAddress")}</FieldError>
        ) : (
          <FieldDescription>{t("users.detail.account.email.changeHint")}</FieldDescription>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={changeMutation.isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {changeMutation.isPending ? <Spinner /> : null}
          {t("common:actions.save")}
        </Button>
      </div>
    </form>
  );
}

export function AccountEmailCard({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const [isEditing, setIsEditing] = useState(false);
  const { cooldown, startCooldown } = useResendCooldown();

  function finishEmailChange() {
    setIsEditing(false);
    startCooldown(0);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("common:labels.email")} description={t("users.detail.account.email.description")} />
      <div className="border-t">
        <SettingsRow
          icon={Mail01Icon}
          title={<span className="break-all">{user.email}</span>}
          badge={
            user.isEmailVerified ? (
              <StatusBadge tone="success" icon={CheckmarkCircle02Icon} className="text-emerald-700">
                {t("settings:account.email.verified")}
              </StatusBadge>
            ) : (
              <UserStatusBadge status="unverified" />
            )
          }
          wrap
        >
          {isEditing ? null : (
            <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => setIsEditing(true)}>
              {t("settings:account.email.change")}
            </Button>
          )}
        </SettingsRow>
        {isEditing ? <EmailChangeForm user={user} onCancel={() => setIsEditing(false)} onChanged={finishEmailChange} /> : null}
        {isEditing || user.isEmailVerified ? null : <UnverifiedEmailActions user={user} cooldown={cooldown} onResent={() => startCooldown()} />}
      </div>
    </SettingsCard>
  );
}
