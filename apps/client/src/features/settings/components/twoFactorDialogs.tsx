import { Alert02Icon, Copy01Icon, Download01Icon, Key01Icon, PrinterIcon, SecurityCheckIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { readAuthError, showSettingsError } from "../authErrors";
import { useCopyText } from "../copyText";
import { sessionsQueryOptions, unwrapAuth } from "../queries";
import { PasswordInput } from "./passwordInput";
import { OtpField } from "@/components/auth/otp-field";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";

const TOTP_CODE_LENGTH = 6;

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function buildQrCode(encode: typeof import("uqr").encode, value: string) {
  const { data, size } = encode(value, { border: 4, ecc: "M" });
  const segments: string[] = [];

  for (const [rowIndex, row] of data.entries()) {
    let runStart: number | undefined;
    for (let columnIndex = 0; columnIndex <= row.length; columnIndex += 1) {
      const dark = row[columnIndex] ?? false;
      if (dark && runStart === undefined) {
        runStart = columnIndex;
        continue;
      }
      if (!dark && runStart !== undefined) {
        segments.push(`M${runStart} ${rowIndex}h${columnIndex - runStart}v1H${runStart}z`);
        runStart = undefined;
      }
    }
  }

  return { path: segments.join(""), size };
}

function readSetupKey(totpUri: string): string | null {
  try {
    return new URL(totpUri).searchParams.get("secret");
  } catch {
    return null;
  }
}

function createTextFileUrl(text: string) {
  return URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
}

function downloadTextFile(text: string, fileName: string) {
  const url = createTextFileUrl(text);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printTextFile(text: string) {
  const url = createTextFileUrl(text);
  const frame = document.createElement("iframe");
  const { clientWidth, clientHeight } = document.documentElement;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    frame.remove();
    URL.revokeObjectURL(url);
  };

  frame.setAttribute("aria-hidden", "true");
  frame.width = `${clientWidth}px`;
  frame.height = `${clientHeight}px`;
  frame.style.position = "absolute";
  frame.style.top = `-${clientHeight + 100}px`;
  frame.style.left = `-${clientWidth + 100}px`;
  frame.style.border = "0";
  frame.addEventListener(
    "load",
    () => {
      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      frameWindow.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(cleanup, 60_000);
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
      }
    },
    { once: true },
  );
  frame.addEventListener("error", cleanup, { once: true });
  frame.src = url;
  document.body.append(frame);
}

function BackupCodesPanel({ codes }: { codes: string[] }) {
  const { t } = useTranslation(["settings", "common"]);
  const { copied, copy } = useCopyText();

  const buildText = () =>
    [
      t("security.twoFactor.backupCodesForWebsite", { website: window.location.host }),
      t("security.twoFactor.backupCodesDescription"),
      "",
      ...codes,
    ].join("\n");

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="tracking-wide">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copy(buildText())}>
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} data-icon="inline-start" aria-hidden="true" />
          {copied ? t("common:actions.copied") : t("common:actions.copy")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile(buildText(), "backup-codes.txt")}>
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("security.twoFactor.download")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => printTextFile(buildText())}>
          <HugeiconsIcon icon={PrinterIcon} data-icon="inline-start" aria-hidden="true" />
          {t("security.twoFactor.print")}
        </Button>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation("settings");
  const passwordId = useId();

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={passwordId}>{t("common:labels.password")}</FieldLabel>
      <PasswordInput
        id={passwordId}
        value={value}
        onChange={onChange}
        autoComplete="current-password"
        placeholder={t("security.password.currentPasswordPlaceholder")}
        invalid={invalid}
        disabled={disabled}
        required
      />
      {invalid ? <FieldError>{t("security.password.invalidCurrent")}</FieldError> : null}
    </Field>
  );
}

type EnableStep = "password" | "verify" | "backupCodes";

export function EnableTwoFactorDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const setupKeyId = useId();
  const { copied: setupKeyCopied, copy: copySetupKey } = useCopyText();
  const [step, setStep] = useState<EnableStep>("password");
  const [password, setPassword] = useState("");
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [totpUri, setTotpUri] = useState("");
  const [qrCode, setQrCode] = useState<ReturnType<typeof buildQrCode> | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [codeInvalid, setCodeInvalid] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) return;
    setStep("password");
    setPassword("");
    setPasswordInvalid(false);
    setTotpUri("");
    setQrCode(null);
    setBackupCodes([]);
    setCode("");
    setCodeInvalid(false);
  };

  const enableMutation = useMutation({
    mutationFn: async (currentPassword: string) => {
      const [data, { encode }] = await Promise.all([unwrapAuth(authClient.twoFactor.enable({ password: currentPassword })), import("uqr")]);
      if (!("totpURI" in data)) throw new Error("Two-factor setup did not return a TOTP secret");
      return { ...data, qrCode: buildQrCode(encode, data.totpURI) };
    },
    onSuccess: (data) => {
      setTotpUri(data.totpURI);
      setQrCode(data.qrCode);
      setBackupCodes(data.backupCodes);
      setPassword("");
      setStep("verify");
    },
    onError: (error) => {
      if (readAuthError(error).code === "INVALID_PASSWORD") {
        setPasswordInvalid(true);
        return;
      }
      showSettingsError(error);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (totpCode: string) => unwrapAuth(authClient.twoFactor.verifyTotp({ code: totpCode })),
    onSuccess: () => {
      toast.success(t("security.twoFactor.enabledToast"));
      void queryClient.invalidateQueries();
      setStep("backupCodes");
    },
    onError: (error) => {
      setCode("");
      if (readAuthError(error).code === "INVALID_CODE") {
        setCodeInvalid(true);
        return;
      }
      showSettingsError(error);
    },
  });

  const isPending = enableMutation.isPending || verifyMutation.isPending;

  const verifyCode = (value: string) => {
    if (isPending || value.length !== TOTP_CODE_LENGTH) return;
    verifyMutation.mutate(value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "backupCodes") {
      handleOpenChange(false);
      return;
    }
    if (step === "verify") {
      verifyCode(code);
      return;
    }
    if (password.length > 0) enableMutation.mutate(password);
  };

  const setupKey = totpUri ? readSetupKey(totpUri) : null;
  const description =
    step === "password"
      ? t("security.twoFactor.passwordConfirmation")
      : step === "verify"
        ? t("security.twoFactor.scanQrCode")
        : t("security.twoFactor.backupCodesDescription");
  const submitLabel = step === "backupCodes" ? t("common:actions.done") : step === "verify" ? t("common:actions.verify") : t("common:actions.next");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={SecurityCheckIcon} aria-hidden="true" className="size-5" />
              {t("security.twoFactor.enableTitle")}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {step === "password" ? (
            <PasswordField
              value={password}
              onChange={(value) => {
                setPassword(value);
                setPasswordInvalid(false);
              }}
              invalid={passwordInvalid}
              disabled={isPending}
            />
          ) : null}

          {step === "verify" ? (
            <div className="flex flex-col items-center gap-4">
              {qrCode ? (
                <svg aria-hidden="true" className="size-44 rounded-md border" viewBox={`0 0 ${qrCode.size} ${qrCode.size}`}>
                  <path fill="white" d={`M0 0h${qrCode.size}v${qrCode.size}H0z`} />
                  <path fill="black" d={qrCode.path} shapeRendering="crispEdges" />
                </svg>
              ) : null}
              {setupKey ? (
                <Field className="w-full gap-1">
                  <FieldLabel htmlFor={setupKeyId} className="text-xs text-muted-foreground">
                    {t("security.twoFactor.setupKey")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput id={setupKeyId} readOnly value={setupKey} className="font-mono text-xs" />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={setupKeyCopied ? t("common:actions.copied") : t("common:actions.copy")}
                        onClick={() => copySetupKey(setupKey)}
                      >
                        <HugeiconsIcon icon={setupKeyCopied ? Tick02Icon : Copy01Icon} />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              ) : null}
              <OtpField
                className="w-full"
                label={t("security.twoFactor.authenticatorCode")}
                length={TOTP_CODE_LENGTH}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  setCodeInvalid(false);
                }}
                onComplete={verifyCode}
                disabled={isPending}
                errorMessage={codeInvalid ? t("common:validation.invalidCode") : undefined}
              />
            </div>
          ) : null}

          {step === "backupCodes" ? <BackupCodesPanel codes={backupCodes} /> : null}

          <DialogFooter>
            {step === "backupCodes" ? null : (
              <Button type="button" variant="outline" disabled={isPending} onClick={() => handleOpenChange(false)}>
                {t("common:actions.cancel")}
              </Button>
            )}
            <Button
              type="submit"
              disabled={isPending || (step === "password" && password.length === 0) || (step === "verify" && code.length !== TOTP_CODE_LENGTH)}
            >
              {isPending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DisableTwoFactorDialog({ open, onOpenChange, userId }: DialogProps & { userId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [passwordInvalid, setPasswordInvalid] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) return;
    setPassword("");
    setPasswordInvalid(false);
  };

  const disableMutation = useMutation({
    mutationFn: (currentPassword: string) => unwrapAuth(authClient.twoFactor.disable({ password: currentPassword })),
    onSuccess: () => {
      toast.success(t("security.twoFactor.disabledToast"));
      void queryClient.invalidateQueries({ queryKey: sessionsQueryOptions(userId).queryKey });
      handleOpenChange(false);
    },
    onError: (error) => {
      if (readAuthError(error).code === "INVALID_PASSWORD") {
        setPasswordInvalid(true);
        return;
      }
      showSettingsError(error);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (password.length > 0) disableMutation.mutate(password);
          }}
          className="flex flex-col gap-6"
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <HugeiconsIcon icon={Alert02Icon} />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("security.twoFactor.disableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("security.twoFactor.disableDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <PasswordField
            value={password}
            onChange={(value) => {
              setPassword(value);
              setPasswordInvalid(false);
            }}
            invalid={passwordInvalid}
            disabled={disableMutation.isPending}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={disableMutation.isPending || password.length === 0}>
              {disableMutation.isPending ? <Spinner /> : null}
              {t("security.twoFactor.disable")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RegenerateBackupCodesDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [password, setPassword] = useState("");
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) return;
    setPassword("");
    setPasswordInvalid(false);
    setCodes([]);
  };

  const generateMutation = useMutation({
    mutationFn: (currentPassword: string) => unwrapAuth(authClient.twoFactor.generateBackupCodes({ password: currentPassword })),
    onSuccess: (data) => {
      setPassword("");
      setCodes(data.backupCodes);
      toast.success(t("security.twoFactor.regeneratedToast"));
    },
    onError: (error) => {
      if (readAuthError(error).code === "INVALID_PASSWORD") {
        setPasswordInvalid(true);
        return;
      }
      showSettingsError(error);
    },
  });

  const hasCodes = codes.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (hasCodes) {
              handleOpenChange(false);
              return;
            }
            if (password.length > 0) generateMutation.mutate(password);
          }}
          className="flex flex-col gap-6"
        >
          <AlertDialogHeader>
            <AlertDialogMedia>
              <HugeiconsIcon icon={Key01Icon} />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("security.twoFactor.backupCodes")}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasCodes ? t("security.twoFactor.backupCodesDescription") : t("security.twoFactor.regenerateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {hasCodes ? (
            <BackupCodesPanel codes={codes} />
          ) : (
            <PasswordField
              value={password}
              onChange={(value) => {
                setPassword(value);
                setPasswordInvalid(false);
              }}
              invalid={passwordInvalid}
              disabled={generateMutation.isPending}
            />
          )}
          <AlertDialogFooter>
            {hasCodes ? null : <AlertDialogCancel disabled={generateMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>}
            <Button type="submit" disabled={generateMutation.isPending || (!hasCodes && password.length === 0)}>
              {generateMutation.isPending ? <Spinner /> : null}
              {hasCodes ? t("common:actions.done") : t("security.twoFactor.regenerate")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
