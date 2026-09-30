import { FingerPrintIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "@/lib/auth/socialProviders";

const VERIFICATION_EMAIL_RATE_LIMIT_CODE = "VERIFICATION_EMAIL_RATE_LIMITED";

interface AuthRequestError {
  code?: string;
  message?: string;
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function OAuthButtons() {
  const { t } = useTranslation("auth");
  const [loadingProvider, setLoadingProvider] = useState<SocialProviderId | null>(null);
  const lastUsed = authClient.getLastUsedLoginMethod();

  async function handleOAuth(provider: SocialProviderId) {
    setLoadingProvider(provider);

    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.pathname,
      });
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {SOCIAL_PROVIDERS.map(({ id, label, icon }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          size="lg"
          className="relative w-full gap-2.5 font-medium"
          disabled={loadingProvider !== null}
          onClick={() => handleOAuth(id)}
        >
          {loadingProvider === id ? <Spinner /> : <HugeiconsIcon icon={icon} className="size-4.5" />}
          <span>{label}</span>
          {lastUsed === id && (
            <span className="absolute -top-2 -right-1.5 px-1.5 py-px rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-tight tracking-wide uppercase">
              {t("oauth.lastUsed")}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

function PasskeyButton({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation("auth");
  const [isLoading, setIsLoading] = useState(false);
  const lastUsed = authClient.getLastUsedLoginMethod();

  async function handlePasskey() {
    setIsLoading(true);

    try {
      const { error } = await authClient.signIn.passkey();

      if (error) {
        if (error.message?.includes("cancelled") || error.message?.includes("abort")) return;
        toast.error(error.message ?? t("passkey.error"));
        return;
      }

      toast.success(t("signIn.success"));
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="lg" className="relative w-full gap-2.5 font-medium" disabled={isLoading} onClick={handlePasskey}>
      {isLoading ? <Spinner /> : <HugeiconsIcon icon={FingerPrintIcon} className="size-4.5" />}
      <span>{t("passkey.signIn")}</span>
      {lastUsed === "passkey" && (
        <span className="absolute -top-2 -right-1.5 px-1.5 py-px rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-tight tracking-wide uppercase">
          {t("oauth.lastUsed")}
        </span>
      )}
    </Button>
  );
}

function OAuthDivider() {
  const { t } = useTranslation("auth");
  return (
    <div className="relative my-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-background px-3 text-muted-foreground">{t("oauth.divider")}</span>
      </div>
    </div>
  );
}

export function TotpVerifyForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation("auth");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleVerify(totpCode: string) {
    if (totpCode.length !== 6) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: totpCode,
        trustDevice: true,
      });

      if (verifyError) {
        setError(verifyError.message ?? t("common:validation.invalidCode"));
        setCode("");
        return;
      }

      toast.success(t("signIn.success"));
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCodeChange(value: string) {
    setCode(value);
    if (value.length === 6) {
      void handleVerify(value);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("common:labels.twoFactor")}</DialogTitle>
        <DialogDescription>{t("totp.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 mt-4">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={handleCodeChange} disabled={isSubmitting}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error ? <InlineError title={t("totp.failed")} description={error} /> : null}
        <Button size="lg" className="w-full" disabled={isSubmitting || code.length !== 6} onClick={() => handleVerify(code)}>
          {isSubmitting ? (
            <>
              <Spinner />
              {t("common:actions.verifying")}
            </>
          ) : (
            t("common:actions.verify")
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("totp.hint")}</p>
      </div>
    </>
  );
}

export function SignInForm({
  onSuccess,
  onSwitchView,
  onTwoFactorRequired,
}: {
  onSuccess: () => void;
  onSwitchView: () => void;
  onTwoFactorRequired: () => void;
}) {
  const { t } = useTranslation("auth");
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      setVerificationEmail(null);

      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess(ctx: { data: { twoFactorRedirect?: boolean } }) {
            if (ctx.data?.twoFactorRedirect) {
              onTwoFactorRequired();
              return;
            }
            toast.success(t("signIn.success"));
            onSuccess();
          },
          onError(ctx: { error: AuthRequestError }) {
            setError(ctx.error.message ?? t("unexpectedError"));
            if (ctx.error.code === "EMAIL_NOT_VERIFIED") setVerificationEmail(value.email);
          },
        },
      );
    },
  });

  async function handleResetPassword(email: string) {
    setResetLoading(true);
    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/account/reset-password",
      });
      if (resetError) {
        toast.error(resetError.message ?? t("resetPassword.requestError"));
        return;
      }

      setResetSent(true);
      toast.success(t("resetPassword.requestSuccess"));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResendVerification() {
    if (verificationEmail === null) return;

    setResendLoading(true);

    try {
      const { error: resendError } = await authClient.sendVerificationEmail({
        email: verificationEmail,
      });

      if (resendError === null) {
        setVerificationEmail(null);
        toast.success(t("signIn.verificationResendSuccess"));
        return;
      }

      const rateLimited = resendError.status === 429 || getErrorCode(resendError) === VERIFICATION_EMAIL_RATE_LIMIT_CODE;
      if (rateLimited) {
        setVerificationEmail(null);
        toast.error(t("signIn.verificationResendRateLimited"));
        return;
      }

      toast.error(t("signIn.verificationResendError"));
    } catch {
      toast.error(t("signIn.verificationResendError"));
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("signIn.title")}</DialogTitle>
        <DialogDescription>{t("signIn.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 mt-4">
        <OAuthButtons />
        <PasskeyButton onSuccess={onSuccess} />
        <OAuthDivider />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="sign-in-email">{t("common:labels.email")}</Label>
                <Input
                  id="sign-in-email"
                  type="email"
                  placeholder={t("common:placeholder.email")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="email"
                />
              </div>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sign-in-password">{t("common:labels.password")}</Label>
                  <form.Subscribe selector={(s) => s.values.email}>
                    {(email) => (
                      <button
                        type="button"
                        title={!email ? t("signIn.resetPasswordDisabled") : undefined}
                        disabled={!email || resetLoading || resetSent}
                        onClick={() => void handleResetPassword(email)}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {resetLoading ? <Spinner className="size-3" /> : t("signIn.resetPassword")}
                      </button>
                    )}
                  </form.Subscribe>
                </div>
                <Input
                  id="sign-in-password"
                  type="password"
                  placeholder={t("common:password.placeholder")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="current-password"
                />
              </div>
            )}
          </form.Field>
          {error ? (
            <div className="space-y-1.5">
              <InlineError title={t("signIn.failed")} description={error} />
              {verificationEmail !== null ? (
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                  disabled={resendLoading}
                  onClick={() => void handleResendVerification()}
                >
                  {resendLoading ? <Spinner className="size-3" /> : null}
                  <span>{t(resendLoading ? "signIn.verificationResending" : "signIn.verificationResend")}</span>
                </button>
              ) : null}
            </div>
          ) : null}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner />
                    {t("signIn.submitting")}
                  </>
                ) : (
                  t("common:actions.signIn")
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("signIn.noAccount")}{" "}
          <button type="button" className="text-primary underline-offset-4 hover:underline font-medium" onClick={onSwitchView}>
            {t("signIn.signUpLink")}
          </button>
        </p>
      </div>
    </>
  );
}

export function SignUpForm({ onSuccess, onSwitchView }: { onSuccess: () => void; onSwitchView: () => void }) {
  const { t, i18n } = useTranslation("auth");
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", username: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);

      const { error: signUpError } = await authClient.signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
        username: value.username,
        bio: "",
        locale: i18n.language,
      });

      if (signUpError) {
        setError(signUpError.message ?? t("unexpectedError"));
        return;
      }

      toast.success(t("signUp.success"));
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("signUp.title")}</DialogTitle>
        <DialogDescription>{t("signUp.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-3"
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="sign-up-name">{t("signUp.name")}</Label>
                <Input
                  id="sign-up-name"
                  type="text"
                  placeholder={t("signUp.namePlaceholder")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="name"
                />
              </div>
            )}
          </form.Field>
          <form.Field name="username">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="sign-up-username">{t("common:labels.username")}</Label>
                <Input
                  id="sign-up-username"
                  type="text"
                  placeholder={t("signUp.usernamePlaceholder")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="username"
                />
              </div>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="sign-up-email">{t("common:labels.email")}</Label>
                <Input
                  id="sign-up-email"
                  type="email"
                  placeholder={t("common:placeholder.email")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="email"
                />
              </div>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="sign-up-password">{t("common:labels.password")}</Label>
                <Input
                  id="sign-up-password"
                  type="password"
                  placeholder={t("signUp.passwordPlaceholder")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={form.state.isSubmitting}
                  autoComplete="new-password"
                />
              </div>
            )}
          </form.Field>
          {error ? <InlineError title={t("signUp.failed")} description={error} /> : null}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner />
                    {t("signUp.submitting")}
                  </>
                ) : (
                  t("signUp.title")
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("signUp.hasAccount")}{" "}
          <button type="button" className="text-primary underline-offset-4 hover:underline font-medium" onClick={onSwitchView}>
            {t("common:actions.signIn")}
          </button>
        </p>
      </div>
    </>
  );
}
