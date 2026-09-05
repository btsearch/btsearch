import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";

type ResetPasswordSearch = {
  token?: string;
};

function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);

  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({
        newPassword: value.newPassword,
        token: token ?? "",
      });

      if (error) {
        toast.error(error.message ?? t("resetPassword.invalidToken"));
        return;
      }

      setDone(true);
    },
  });

  return (
    <div className="px-4 pt-12 pb-16 flex justify-center">
      <div className="w-full max-w-sm space-y-6">
        {!token ? (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{t("resetPassword.invalidToken")}</h1>
            </div>
            <Button>
              <Link to="/">{t("resetPassword.backToSignIn")}</Link>
            </Button>
          </>
        ) : done ? (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{t("resetPassword.success")}</h1>
            </div>
            <Button>
              <Link to="/">{t("resetPassword.backToSignIn")}</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{t("resetPassword.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("resetPassword.description")}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="space-y-4"
            >
              <form.Field
                name="newPassword"
                validators={{
                  onBlur: ({ value }) => (value.length > 0 && value.length < 8 ? t("resetPassword.passwordTooShort") : undefined),
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t("resetPassword.newPassword")}</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder={t("resetPassword.newPasswordPlaceholder")}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      autoFocus
                      disabled={form.state.isSubmitting}
                      className="text-base"
                    />
                    {field.state.meta.errors.length > 0 && <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="confirmPassword"
                validators={{
                  onBlur: ({ value, fieldApi }) => {
                    const newPassword = fieldApi.form.getFieldValue("newPassword");
                    if (value && value !== newPassword) return t("resetPassword.passwordMismatch");
                    return undefined;
                  },
                  onChange: ({ value, fieldApi }) => {
                    if (!fieldApi.state.meta.isTouched) return undefined;
                    const newPassword = fieldApi.form.getFieldValue("newPassword");
                    if (value && value !== newPassword) return t("resetPassword.passwordMismatch");
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t("resetPassword.confirmPassword")}</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder={t("resetPassword.confirmPasswordPlaceholder")}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                      autoComplete="new-password"
                      disabled={form.state.isSubmitting}
                      className="text-base"
                    />
                    {field.state.meta.errors.length > 0 && <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>}
                  </div>
                )}
              </form.Field>

              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner />
                        {t("resetPassword.submitting")}
                      </>
                    ) : (
                      t("resetPassword.submit")
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <p className="text-sm">
              <Link to="/" className="text-muted-foreground underline-offset-4 hover:underline">
                {t("resetPassword.backToSignIn")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/account/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  staticData: {
    titleKey: "resetPassword.title",
    i18nNamespace: "auth",
    breadcrumbs: [],
  },
});
