import {
  Add01Icon,
  Alert02Icon,
  ComputerIcon,
  Delete02Icon,
  FingerPrintIcon,
  Logout02Icon,
  PencilEdit02Icon,
  SecurityCheckIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isFreshSessionError, showSettingsError } from "../authErrors";
import {
  type SessionDevice,
  type SessionWithDevice,
  linkedAccountsQueryOptions,
  passkeysQueryOptions,
  passwordStatusQueryOptions,
  sessionsQueryOptions,
  unwrapAuth,
} from "../queries";
import { useRequestReauth } from "../reauth";
import { SETTINGS_SECTION_IDS } from "../sections";
import { ConfirmDialog } from "./confirmDialog";
import type { SettingsUser } from "./identityBanner";
import { AddPasskeyDialog, RenamePasskeyDialog, type SettingsPasskey } from "./passkeyDialogs";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SETTINGS_TWO_COLUMN_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  SettingsSection,
  SettingsStack,
  StatusBadge,
} from "./settingsPrimitives";
import { SignInMethodsCard } from "./signInMethodsCard";
import { DisableTwoFactorDialog, EnableTwoFactorDialog, RegenerateBackupCodesDialog } from "./twoFactorDialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth/client";
import { getDateFormatter } from "@/lib/dateFormat";
import { formatIpAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

type TwoFactorDialog = "enable" | "disable" | "regenerate";

function TwoFactorCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const { data: hasPassword } = useQuery(passwordStatusQueryOptions(user.id));
  const isEnabled = user.twoFactorEnabled === true;
  const [dialog, setDialog] = useState<TwoFactorDialog | null>(user.forceTotp === true && !isEnabled ? "enable" : null);

  const needsPassword = !isEnabled && hasPassword === false;
  const openChange = (target: TwoFactorDialog) => (open: boolean) => setDialog(open ? target : null);

  return (
    <SettingsCard>
      <SettingsCardHeader
        wrap
        icon={SecurityCheckIcon}
        title={t("common:labels.twoFactor")}
        badge={
          isEnabled ? (
            <StatusBadge tone="success">{t("security.twoFactor.on")}</StatusBadge>
          ) : (
            <StatusBadge tone="warning" icon={Alert02Icon}>
              {t("security.twoFactor.off")}
            </StatusBadge>
          )
        }
        description={needsPassword ? t("security.twoFactor.requiresPassword") : t("security.twoFactor.description")}
        action={
          isEnabled ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDialog("regenerate")}>
                {t("security.twoFactor.regenerate")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog("disable")}>
                {t("security.twoFactor.disable")}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" disabled={hasPassword === false} onClick={() => setDialog("enable")}>
              {t("security.twoFactor.enable")}
            </Button>
          )
        }
      />
      <EnableTwoFactorDialog open={dialog === "enable"} onOpenChange={openChange("enable")} />
      <DisableTwoFactorDialog open={dialog === "disable"} onOpenChange={openChange("disable")} userId={user.id} />
      <RegenerateBackupCodesDialog open={dialog === "regenerate"} onOpenChange={openChange("regenerate")} />
    </SettingsCard>
  );
}

function RowIconButton({
  label,
  icon,
  onClick,
  disabled = false,
  destructive = false,
}: {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn("text-muted-foreground", destructive && "hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15")}
        >
          <HugeiconsIcon icon={icon} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PasskeyRow({
  passkey,
  userId,
  addedOn,
  deleteLocked,
}: {
  passkey: SettingsPasskey;
  userId: string;
  addedOn: string;
  deleteLocked: boolean;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => unwrapAuth(authClient.passkey.deletePasskey({ id: passkey.id })),
    onSuccess: () => {
      setDialog(null);
      toast.success(t("security.passkeys.deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: passkeysQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const name = passkey.name || t("security.passkeys.unnamed");

  return (
    <SettingsRow
      icon={FingerPrintIcon}
      title={<span className="break-all">{name}</span>}
      description={t("security.passkeys.addedOn", { date: addedOn })}
    >
      <RowIconButton label={t("security.passkeys.rename")} icon={PencilEdit02Icon} onClick={() => setDialog("rename")} />
      <RowIconButton
        label={deleteLocked ? t("security.passkeys.lastMethod") : t("common:actions.delete")}
        icon={Delete02Icon}
        destructive
        disabled={deleteLocked}
        onClick={() => setDialog("delete")}
      />
      {dialog === "rename" ? <RenamePasskeyDialog passkey={passkey} userId={userId} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={t("security.passkeys.deleteTitle")}
        description={t("security.passkeys.deleteDescription", { name })}
        confirmLabel={t("common:actions.delete")}
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </SettingsRow>
  );
}

function PasskeysCard({ user }: { user: SettingsUser }) {
  const { t, i18n } = useTranslation("settings");
  const { data: passkeys, isPending, isError, isFetching, refetch } = useQuery(passkeysQueryOptions(user.id));
  const { data: accounts } = useQuery(linkedAccountsQueryOptions(user.id));
  const { data: hasPassword } = useQuery(passwordStatusQueryOptions(user.id));
  const [addOpen, setAddOpen] = useState(false);

  const hasOtherSignInMethod = hasPassword === true || (accounts?.some((account) => account.providerId !== "credential") ?? false);
  const dateFormatter = getDateFormatter(i18n.language);

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("security.passkeys.title")}
        description={t("security.passkeys.description")}
        action={
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setAddOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("security.passkeys.add")}
          </Button>
        }
      />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : isError || passkeys === undefined ? (
          <SettingsRowError title={t("security.passwordless.passkeysLoadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : passkeys.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("security.passkeys.empty")}</p>
            <p className={cn("mt-0.5 max-w-md", SETTINGS_DESCRIPTION_CLASS)}>{t("security.passkeys.emptyDescription")}</p>
          </div>
        ) : (
          passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              userId={user.id}
              addedOn={dateFormatter.format(new Date(passkey.createdAt))}
              deleteLocked={!hasOtherSignInMethod && passkeys.length === 1}
            />
          ))
        )}
      </div>
      <AddPasskeyDialog open={addOpen} onOpenChange={setAddOpen} userId={user.id} />
    </SettingsCard>
  );
}

function deviceLabel(device: SessionDevice, fallback: string) {
  return [device.browser, device.os].filter(Boolean).join(", ") || fallback;
}

function SessionSignedIn({ createdAt }: { createdAt: SessionWithDevice["createdAt"] }) {
  const { t } = useTranslation("settings");
  const time = useRelativeTime(new Date(createdAt).toISOString());

  return t("sessions.signedIn", { time });
}

function SessionRow({ item, isCurrent, onRevoke }: { item: SessionWithDevice; isCurrent: boolean; onRevoke: (device: string) => void }) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const label = deviceLabel(item.device, t("sessions.unknownDevice"));
  const activity = isCurrent ? t("sessions.activeNow") : <SessionSignedIn createdAt={item.createdAt} />;
  const ipAddress = formatIpAddress(item.ipAddress);

  return (
    <SettingsRow
      icon={item.device.mobile ? SmartPhone01Icon : ComputerIcon}
      title={label}
      badge={isCurrent ? <StatusBadge tone="primary">{t("sessions.current")}</StatusBadge> : null}
      description={
        <SettingsMeta>
          <SettingsMetaItem>{activity}</SettingsMetaItem>
          {ipAddress ? <SettingsMetaItem>IP: {ipAddress}</SettingsMetaItem> : null}
        </SettingsMeta>
      }
    >
      {isCurrent ? (
        <Link to="/account/sign-out" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {tCommon("actions.signOut")}
        </Link>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
          onClick={() => onRevoke(label)}
        >
          {tCommon("actions.revoke")}
        </Button>
      )}
    </SettingsRow>
  );
}

function SessionsCard({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const requestReauth = useRequestReauth();
  const { data: currentSession } = authClient.useSession();
  const { data: sessions, error, isPending, isFetching, refetch } = useQuery(sessionsQueryOptions(user.id));
  const [revokeTarget, setRevokeTarget] = useState<{ token: string; device: string } | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const revokeMutation = useMutation({
    mutationFn: (token: string) => unwrapAuth(authClient.revokeSession({ token })),
    onSuccess: () => {
      setRevokeTarget(null);
      toast.success(t("sessions.revokeSuccess"));
      void queryClient.invalidateQueries({ queryKey: sessionsQueryOptions(user.id).queryKey });
    },
    onError: showSettingsError,
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => unwrapAuth(authClient.revokeOtherSessions()),
    onSuccess: () => {
      setConfirmOthers(false);
      toast.success(t("sessions.revokeOthersSuccess"));
      void queryClient.invalidateQueries({ queryKey: sessionsQueryOptions(user.id).queryKey });
    },
    onError: showSettingsError,
  });

  const currentToken = currentSession?.session.token;
  const orderedSessions = [...(sessions ?? [])].sort((left, right) => {
    if (left.token === currentToken) return -1;
    if (right.token === currentToken) return 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
  const otherSessionCount = orderedSessions.filter((item) => item.token !== currentToken).length;
  const needsFreshSession = isFreshSessionError(error);

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("sessions.title")}
        description={t("sessions.description")}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={(!needsFreshSession && otherSessionCount === 0) || revokeOthersMutation.isPending}
            onClick={() => setConfirmOthers(true)}
          >
            <HugeiconsIcon icon={Logout02Icon} data-icon="inline-start" aria-hidden="true" />
            {t("sessions.revokeOthers")}
          </Button>
        }
      />
      <div className="border-t">
        {needsFreshSession ? (
          <div className="flex flex-col items-start gap-3 px-4 py-4 sm:px-5">
            <div>
              <p className="text-sm leading-5 font-medium">{t("sessions.freshTitle")}</p>
              <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("sessions.freshDescription")}</p>
            </div>
            <Button type="button" size="sm" onClick={requestReauth}>
              {t("sessions.freshAction")}
            </Button>
          </div>
        ) : isPending ? (
          <SettingsRowSkeleton />
        ) : error ? (
          <SettingsRowError title={t("sessions.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          orderedSessions.map((item) => (
            <SessionRow
              key={item.id}
              item={item}
              isCurrent={item.token === currentToken}
              onRevoke={(device) => setRevokeTarget({ token: item.token, device })}
            />
          ))
        )}
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={t("sessions.revokeConfirmTitle")}
        description={t("sessions.revokeConfirmDescription", { device: revokeTarget?.device ?? "" })}
        confirmLabel={t("common:actions.revoke")}
        pending={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) revokeMutation.mutate(revokeTarget.token);
        }}
      />
      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t("sessions.revokeOthersConfirmTitle")}
        description={t("sessions.revokeOthersConfirmDescription")}
        confirmLabel={t("sessions.revokeOthers")}
        pending={revokeOthersMutation.isPending}
        onConfirm={() => revokeOthersMutation.mutate()}
      />
    </SettingsCard>
  );
}

export function SecuritySection({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.security} title={t("sections.security")}>
      <div className={SETTINGS_TWO_COLUMN_CLASS}>
        <SettingsStack>
          <SignInMethodsCard user={user} />
          <TwoFactorCard user={user} />
        </SettingsStack>
        <SettingsStack>
          <PasskeysCard user={user} />
          <SessionsCard user={user} />
        </SettingsStack>
      </div>
    </SettingsSection>
  );
}
