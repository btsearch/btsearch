import type { DialogRootChangeEventDetails } from "@base-ui/react/dialog";
import { Suspense, lazy, useEffect, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { queryClient } from "@/lib/queryClient";

const SignInForm = lazy(() => import("./authDialogForms").then((module) => ({ default: module.SignInForm })));
const SignUpForm = lazy(() => import("./authDialogForms").then((module) => ({ default: module.SignUpForm })));
const TotpVerifyForm = lazy(() => import("./authDialogForms").then((module) => ({ default: module.TotpVerifyForm })));

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forced?: boolean;
}

const BLOCKED_REASONS = new Set(["escape-key", "close-press", "outside-press", "focus-out"]);

const formFallback = (
  <div className="flex h-96 items-center justify-center">
    <Spinner />
  </div>
);

export function AuthDialog({ open, onOpenChange, forced = false }: AuthDialogProps) {
  const [view, setView] = useState<"signIn" | "signUp" | "totp">("signIn");

  useEffect(() => {
    if (!open) return;

    function handle() {
      setView("totp");
    }
    window.addEventListener("two-factor-redirect", handle);
    return () => window.removeEventListener("two-factor-redirect", handle);
  }, [open]);

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
        <Suspense fallback={formFallback}>
          {view === "totp" ? (
            <TotpVerifyForm onSuccess={handleSuccess} />
          ) : view === "signIn" ? (
            <SignInForm onSuccess={handleSuccess} onSwitchView={() => setView("signUp")} onTwoFactorRequired={() => setView("totp")} />
          ) : (
            <SignUpForm onSuccess={handleSuccess} onSwitchView={() => setView("signIn")} />
          )}
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
