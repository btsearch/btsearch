import { CheckmarkCircle02Icon, FingerPrintIcon, SecurityLockIcon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const EMPTY_ERRORS: (string | undefined)[] = [];

interface Props {
  userId: string;
  hasPassword: boolean;
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  errors?: (string | undefined)[];
}

function PasswordField({ label, value, onChange, onBlur, show, onToggleShow, autoComplete, placeholder, errors }: PasswordFieldProps) {
  const firstError = errors?.find((e) => e !== undefined);
  const hasError = firstError !== undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <div
        className={cn(
          "h-9 rounded-md border flex items-center px-3 gap-2 bg-background transition-colors",
          hasError ? "border-destructive" : "border-input focus-within:border-ring",
        )}
      >
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button type="button" onClick={onToggleShow} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" tabIndex={-1}>
          <HugeiconsIcon icon={show ? ViewOffSlashIcon : ViewIcon} className="size-3.5" />
        </button>
      </div>
      {hasError ? <p className="text-xs text-destructive">{firstError}</p> : null}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 py-3.5 border-b flex items-center gap-2.5">
      <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <HugeiconsIcon icon={SecurityLockIcon} className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold leading-none">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

export function PasswordCard({ userId, hasPassword }: Props) {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();

  const [passkeyVerified, setPasskeyVerified] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.passkey();
      if (error) throw new Error(error.message ?? "Passkey verification failed.");
    },
    onSuccess: () => setPasskeyVerified(true),
    onError: (err: Error) => toast.error(err.message),
  });

  const setPasswordForm = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      try {
        await fetchJson<void>(`${API_BASE}/account/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: value.newPassword }),
        });
        toast.success(t("security.password.setSuccess"));
        void qc.invalidateQueries({ queryKey: ["account", "password", userId] });
        setPasskeyVerified(false);
        setPasswordForm.reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("security.password.setError"));
      }
    },
  });

  const changePasswordForm = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      try {
        const { error } = await authClient.changePassword({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
          revokeOtherSessions: false,
        });
        if (error) {
          if (error.message) {
            toast.error(error.message);
          } else {
            toast.error(t("security.password.changeError"));
          }
          return;
        }
        toast.success(t("security.password.changeSuccess"));
        changePasswordForm.reset();
      } catch {
        toast.error(t("security.password.changeError"));
      }
    },
  });

  if (!hasPassword) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <CardHeader title={t("security.password.setTitle")} subtitle={t("security.password.setSubtitle")} />

        <div className="p-4 flex flex-col gap-3">
          {passkeyVerified ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void setPasswordForm.handleSubmit();
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-500">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
                {t("security.password.passkeyVerified")}
              </div>

              <setPasswordForm.Field
                name="newPassword"
                validators={{
                  onBlur: ({ value }) => (value.length > 0 && value.length < 8 ? t("security.password.tooShort") : undefined),
                }}
              >
                {(field) => (
                  <PasswordField
                    label={t("security.password.newPassword")}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    show={showNew}
                    onToggleShow={() => setShowNew((v) => !v)}
                    autoComplete="new-password"
                    placeholder={t("security.password.newPasswordPlaceholder")}
                    errors={field.state.meta.isTouched ? field.state.meta.errors : EMPTY_ERRORS}
                  />
                )}
              </setPasswordForm.Field>

              <setPasswordForm.Field
                name="confirmPassword"
                validators={{
                  onChangeListenTo: ["newPassword"],
                  onChange: ({ value, fieldApi }) => {
                    const newPassword = fieldApi.form.getFieldValue("newPassword");
                    return value.length > 0 && value !== newPassword ? t("security.password.mismatch") : undefined;
                  },
                }}
              >
                {(field) => (
                  <PasswordField
                    label={t("security.password.confirmPassword")}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    show={showConfirm}
                    onToggleShow={() => setShowConfirm((v) => !v)}
                    autoComplete="new-password"
                    placeholder={t("security.password.confirmPasswordPlaceholder")}
                    errors={field.state.meta.errors}
                  />
                )}
              </setPasswordForm.Field>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPasskeyVerified(false);
                    setPasswordForm.reset();
                  }}
                  className="flex-1"
                >
                  {t("common:actions.cancel")}
                </Button>
                <setPasswordForm.Subscribe selector={(s) => s.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" size="sm" disabled={isSubmitting} className="flex-2">
                      {isSubmitting ? <Spinner className="size-3.5" /> : null}
                      {t(isSubmitting ? "security.password.setting" : "security.password.setAction")}
                    </Button>
                  )}
                </setPasswordForm.Subscribe>
              </div>
            </form>
          ) : (
            <>
              <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2.5">{t("security.password.passkeyHint")}</p>
              <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} className="w-full">
                {verifyMutation.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={FingerPrintIcon} className="size-4" />}
                {t(verifyMutation.isPending ? "security.password.verifying" : "security.password.verifyPasskey")}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <CardHeader title={t("security.password.changeTitle")} subtitle={t("security.password.changeSubtitle")} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void changePasswordForm.handleSubmit();
        }}
        className="p-4 flex flex-col gap-3"
      >
        <changePasswordForm.Field name="currentPassword">
          {(field) => (
            <PasswordField
              label={t("security.password.currentPassword")}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
              placeholder={t("security.password.currentPasswordPlaceholder")}
            />
          )}
        </changePasswordForm.Field>

        <div className="h-px bg-border" />

        <changePasswordForm.Field
          name="newPassword"
          validators={{
            onBlur: ({ value }) => (value.length > 0 && value.length < 8 ? t("security.password.tooShort") : undefined),
          }}
        >
          {(field) => (
            <PasswordField
              label={t("security.password.newPassword")}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              autoComplete="new-password"
              placeholder={t("security.password.newPasswordPlaceholder")}
              errors={field.state.meta.isTouched ? field.state.meta.errors : EMPTY_ERRORS}
            />
          )}
        </changePasswordForm.Field>

        <changePasswordForm.Field
          name="confirmPassword"
          validators={{
            onChangeListenTo: ["newPassword"],
            onChange: ({ value, fieldApi }) => {
              const newPassword = fieldApi.form.getFieldValue("newPassword");
              return value.length > 0 && value !== newPassword ? t("security.password.mismatch") : undefined;
            },
          }}
        >
          {(field) => (
            <PasswordField
              label={t("security.password.confirmPassword")}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              placeholder={t("security.password.confirmPasswordPlaceholder")}
              errors={field.state.meta.errors}
            />
          )}
        </changePasswordForm.Field>

        <changePasswordForm.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="sm" disabled={isSubmitting} className="w-full mt-1">
              {isSubmitting ? <Spinner className="size-3.5" /> : null}
              {t(isSubmitting ? "common:actions.updating" : "security.password.changeAction")}
            </Button>
          )}
        </changePasswordForm.Subscribe>
      </form>
    </div>
  );
}
