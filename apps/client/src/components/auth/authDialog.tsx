import type { DialogRootChangeEventDetails } from "@base-ui/react/dialog";
import { FingerPrintIcon, GithubIcon, GoogleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { queryClient } from "@/lib/queryClient";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forced?: boolean;
}

const BLOCKED_REASONS = new Set(["escape-key", "close-press", "outside-press", "focus-out"]);

type OAuthProvider = "google" | "github";

const OAUTH_PROVIDERS = [
  { id: "google" as OAuthProvider, label: "Google", icon: GoogleIcon },
  { id: "github" as OAuthProvider, label: "GitHub", icon: GithubIcon },
] as const;

function OAuthButtons() {
  const { t } = useTranslation("auth");
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const lastUsed = authClient.getLastUsedLoginMethod();

  async function handleOAuth(provider: OAuthProvider) {
    setLoadingProvider(provider);

    await authClient.signIn.social({
      provider,
      callbackURL: window.location.pathname,
    });

    setLoadingProvider(null);
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {OAUTH_PROVIDERS.map(({ id, label, icon }) => (
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

    const { error } = await authClient.signIn.passkey();

    setIsLoading(false);

    if (error) {
      if (error.message?.includes("cancelled") || error.message?.includes("abort")) return;
      toast.error(error.message ?? t("passkey.error"));
      return;
    }

    toast.success(t("signIn.success"));
    onSuccess();
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

function TotpVerifyForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation("auth");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleVerify(totpCode: string) {
    if (totpCode.length !== 6) return;
    setError(null);
    setIsSubmitting(true);

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({
      code: totpCode,
      trustDevice: true,
    });

    setIsSubmitting(false);

    if (verifyError) {
      setError(verifyError.message ?? t("totp.invalidCode"));
      setCode("");
      return;
    }

    toast.success(t("signIn.success"));
    onSuccess();
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
        <DialogTitle>{t("totp.title")}</DialogTitle>
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
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button size="lg" className="w-full" disabled={isSubmitting || code.length !== 6} onClick={() => handleVerify(code)}>
          {isSubmitting ? (
            <>
              <Spinner />
              {t("totp.verifying")}
            </>
          ) : (
            t("totp.verify")
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("totp.hint")}</p>
      </div>
    </>
  );
}

function SignInForm({
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
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);

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
          onError(ctx: { error: Error }) {
            setError(ctx.error.message ?? "An unexpected error occurred");
          },
        },
      );
    },
  });

  async function handleResetPassword(email: string) {
    setResetLoading(true);
    const { error: resetError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/account/reset-password",
    });
    setResetLoading(false);
    if (resetError) {
      toast.error(resetError.message ?? t("resetPassword.requestError"));
      return;
    }

    setResetSent(true);
    toast.success(t("resetPassword.requestSuccess"));
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
                <Label htmlFor="sign-in-email">{t("signIn.email")}</Label>
                <Input
                  id="sign-in-email"
                  type="email"
                  placeholder={t("signIn.emailPlaceholder")}
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
                  <Label htmlFor="sign-in-password">{t("signIn.password")}</Label>
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
                  placeholder={t("signIn.passwordPlaceholder")}
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner />
                    {t("signIn.submitting")}
                  </>
                ) : (
                  t("signIn.submit")
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

function SignUpForm({ onSuccess, onSwitchView }: { onSuccess: () => void; onSwitchView: () => void }) {
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
        setError(signUpError.message ?? "An unexpected error occurred");
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
                <Label htmlFor="sign-up-username">{t("signUp.username")}</Label>
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
                <Label htmlFor="sign-up-email">{t("signUp.email")}</Label>
                <Input
                  id="sign-up-email"
                  type="email"
                  placeholder={t("signUp.emailPlaceholder")}
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
                <Label htmlFor="sign-up-password">{t("signUp.password")}</Label>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner />
                    {t("signUp.submitting")}
                  </>
                ) : (
                  t("signUp.submit")
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("signUp.hasAccount")}{" "}
          <button type="button" className="text-primary underline-offset-4 hover:underline font-medium" onClick={onSwitchView}>
            {t("signUp.signInLink")}
          </button>
        </p>
      </div>
    </>
  );
}

export function AuthDialog({ open, onOpenChange, forced = false }: AuthDialogProps) {
  const [view, setView] = useState<"signIn" | "signUp" | "totp">("signIn");

  useEffect(() => {
    function handle() {
      setView("totp");
    }
    window.addEventListener("two-factor-redirect", handle);
    return () => window.removeEventListener("two-factor-redirect", handle);
  }, []);

  function handleOpenChange(nextOpen: boolean, details: DialogRootChangeEventDetails) {
    if (forced && !nextOpen && BLOCKED_REASONS.has(details.reason)) return;
    if (view === "totp" && !nextOpen && BLOCKED_REASONS.has(details.reason)) return;
    onOpenChange(nextOpen);

    if (!nextOpen) setView("signIn");
  }

  function handleSuccess() {
    onOpenChange(false);
    setView("signIn");
    queryClient.invalidateQueries();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <DialogContent showCloseButton={!forced && view !== "totp"} className="max-w-sm sm:max-w-md">
        {view === "totp" ? (
          <TotpVerifyForm onSuccess={handleSuccess} />
        ) : view === "signIn" ? (
          <SignInForm onSuccess={handleSuccess} onSwitchView={() => setView("signUp")} onTwoFactorRequired={() => setView("totp")} />
        ) : (
          <SignUpForm onSuccess={handleSuccess} onSwitchView={() => setView("signIn")} />
        )}
      </DialogContent>
    </Dialog>
  );
}
