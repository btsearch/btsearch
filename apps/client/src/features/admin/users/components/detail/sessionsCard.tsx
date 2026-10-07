import { ComputerIcon, Logout02Icon, SmartPhone01Icon, UserSwitchIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { revokeAllUserSessions, revokeUserSession, showUserAdminError, userSessionsQueryOptions } from "../../api/authAdmin";
import { invalidateUserAdminQueries } from "../../api/queryKeys";
import { usersByIdsQueryOptions } from "../../api/users";
import type { AdminSession, AdminUser, NamedUserRef } from "../../types";
import { getAccountName } from "../../utils/identity";
import { getSessionDeviceLabel } from "../../utils/sessions";
import { CenteredCardState, META_USER_LINK_CLASS, RowIconButton } from "./userDetailPrimitives";
import { Button } from "@/components/ui/button";
import { useRelativeTime } from "@/components/ui/relative-time";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  StatusBadge,
} from "@/features/settings/components/settingsPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";
import { useSettledSession } from "@/hooks/useSettledSession";
import { formatIpAddress } from "@/lib/format";

type SessionRowProps = {
  session: AdminSession;
  isCurrent: boolean;
  opener?: NamedUserRef;
  onRevoke: () => void;
};

type SessionRevokeDialogProps = {
  user: AdminUser;
  session: AdminSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AllSessionsRevokeDialogProps = {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NO_SESSIONS: AdminSession[] = [];
const REVOKE_ALL_BUTTON_CLASS = "cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15";

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function getRelativeTimeFormatter(language: string): Intl.RelativeTimeFormat {
  let formatter = relativeTimeFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(language, { numeric: "always" });
    relativeTimeFormatters.set(language, formatter);
  }
  return formatter;
}

function formatTimeUntil(dateString: string, language: string): string {
  const remainingMs = Math.max(new Date(dateString).getTime() - Date.now(), MINUTE_MS);
  const formatter = getRelativeTimeFormatter(language);
  if (remainingMs >= DAY_MS) return formatter.format(Math.floor(remainingMs / DAY_MS), "day");
  if (remainingMs >= HOUR_MS) return formatter.format(Math.floor(remainingMs / HOUR_MS), "hour");
  return formatter.format(Math.floor(remainingMs / MINUTE_MS), "minute");
}

function formatClockTime(dateString: string, language: string): string {
  return new Date(dateString).toLocaleTimeString(language, { timeStyle: "short" });
}

function SessionSignedIn({ createdAt }: { createdAt: string }) {
  const { t } = useTranslation("admin");
  const time = useRelativeTime(createdAt);

  return t("settings:sessions.signedIn", { time });
}

function SessionRow({ session, isCurrent, opener, onRevoke }: SessionRowProps) {
  const { t, i18n } = useTranslation("admin");
  const isAdminSession = session.impersonatedBy !== null;
  const deviceIcon = session.device.mobile ? SmartPhone01Icon : ComputerIcon;
  const ipAddress = formatIpAddress(session.ipAddress);
  const openedAt = formatClockTime(session.createdAt, i18n.language);

  return (
    <SettingsRow
      icon={isAdminSession ? UserSwitchIcon : deviceIcon}
      title={getSessionDeviceLabel(t, session.device)}
      badge={
        isAdminSession ? (
          <StatusBadge tone="warning" icon={UserSwitchIcon} className="text-amber-700">
            {t("users.detail.security.sessions.adminSession")}
          </StatusBadge>
        ) : isCurrent ? (
          <StatusBadge tone="primary">{t("settings:sessions.current")}</StatusBadge>
        ) : null
      }
      description={
        isAdminSession ? (
          <SettingsMeta>
            {ipAddress ? <SettingsMetaItem>{ipAddress}</SettingsMetaItem> : null}
            <SettingsMetaItem>
              {opener !== undefined && opener.name !== "" ? (
                <Trans
                  t={t}
                  i18nKey="admin:users.detail.security.sessions.openedBy"
                  values={{ name: opener.name, time: openedAt }}
                  components={{
                    user: (
                      <UserLink user={opener} className={META_USER_LINK_CLASS}>
                        {opener.name}
                      </UserLink>
                    ),
                  }}
                />
              ) : (
                t("users.detail.security.sessions.openedAt", { time: openedAt })
              )}
            </SettingsMetaItem>
            <SettingsMetaItem>
              {t("users.detail.security.sessions.expiresAt", { time: formatClockTime(session.expiresAt, i18n.language) })}
            </SettingsMetaItem>
          </SettingsMeta>
        ) : (
          <SettingsMeta>
            {ipAddress ? <SettingsMetaItem>{ipAddress}</SettingsMetaItem> : null}
            <SettingsMetaItem>
              <SessionSignedIn createdAt={session.createdAt} />
            </SettingsMetaItem>
            <SettingsMetaItem>
              {t("users.detail.security.sessions.expires", { time: formatTimeUntil(session.expiresAt, i18n.language) })}
            </SettingsMetaItem>
          </SettingsMeta>
        )
      }
    >
      {isCurrent ? null : <RowIconButton label={t("users.detail.security.sessions.revoke")} icon={Logout02Icon} destructive onClick={onRevoke} />}
    </SettingsRow>
  );
}

function SessionRevokeDialog({ user, session, open, onOpenChange }: SessionRevokeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const revokeMutation = useMutation({
    mutationFn: () => revokeUserSession(session.token),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateUserAdminQueries(queryClient, user.id);
      toast.success(t("settings:sessions.revokeSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!revokeMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("settings:sessions.revokeConfirmTitle")}
      description={t("settings:sessions.revokeConfirmDescription", { device: getSessionDeviceLabel(t, session.device) })}
      confirmLabel={t("common:actions.revoke")}
      pending={revokeMutation.isPending}
      onConfirm={() => revokeMutation.mutate()}
    />
  );
}

function AllSessionsRevokeDialog({ user, open, onOpenChange }: AllSessionsRevokeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeAllUserSessions(user.id),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateUserAdminQueries(queryClient, user.id);
      toast.success(t("users.detail.security.sessions.revokeAllSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!revokeAllMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("users.detail.security.sessions.revokeAllConfirm.title")}
      description={t("users.detail.security.sessions.revokeAllConfirm.description", { name: getAccountName(user) })}
      confirmLabel={t("users.detail.security.sessions.revokeAll")}
      pending={revokeAllMutation.isPending}
      onConfirm={() => revokeAllMutation.mutate()}
    />
  );
}

export function SessionsCard({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t } = useTranslation("admin");
  const { data: viewer } = useSettledSession();
  const [sessionToRevoke, setSessionToRevoke] = useState<AdminSession | null>(null);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isRevokeAllOpen, setIsRevokeAllOpen] = useState(false);
  const { data: sessions, isError, isFetching, refetch } = useQuery(userSessionsQueryOptions(user.id));
  const { data: openers } = useQuery(
    usersByIdsQueryOptions((sessions ?? NO_SESSIONS).flatMap((session) => (session.impersonatedBy === null ? [] : [session.impersonatedBy]))),
  );

  const openersById = new Map((openers ?? []).map((opener) => [opener.id, opener]));
  const viewerSessionToken = viewer?.session.token;
  const sessionCount = sessions?.length ?? 0;
  const canRevokeAll = !isSelf && sessionCount > 0;
  const revokeAllButton = (
    <Button type="button" variant="ghost" size="sm" className={REVOKE_ALL_BUTTON_CLASS} onClick={() => setIsRevokeAllOpen(true)}>
      {t("users.detail.security.sessions.revokeAll")}
    </Button>
  );

  function openRevokeDialog(session: AdminSession) {
    setSessionToRevoke(session);
    setIsRevokeOpen(true);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("settings:sessions.title")}
        description={t("users.detail.security.sessions.description")}
        action={canRevokeAll ? <div className="max-sm:hidden">{revokeAllButton}</div> : null}
      />
      {sessions === undefined ? (
        <div className="border-t">
          {isError ? (
            <SettingsRowError title={t("settings:sessions.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
          ) : (
            <SettingsRowSkeleton />
          )}
        </div>
      ) : sessions.length === 0 ? (
        <CenteredCardState
          icon={ComputerIcon}
          title={t("users.detail.security.sessions.empty.title")}
          description={
            user.isBanned ? t("users.detail.security.sessions.empty.bannedDescription") : t("users.detail.security.sessions.empty.description")
          }
        />
      ) : (
        <div className="border-t">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isCurrent={session.token === viewerSessionToken}
              opener={session.impersonatedBy === null ? undefined : openersById.get(session.impersonatedBy)}
              onRevoke={() => openRevokeDialog(session)}
            />
          ))}
        </div>
      )}
      {canRevokeAll ? (
        <SettingsCardFooter className="mt-auto sm:hidden">
          <span className="text-xs text-muted-foreground tabular-nums">{t("users.detail.security.sessions.count", { count: sessionCount })}</span>
          {revokeAllButton}
        </SettingsCardFooter>
      ) : null}
      {sessionToRevoke === null ? null : (
        <SessionRevokeDialog user={user} session={sessionToRevoke} open={isRevokeOpen} onOpenChange={setIsRevokeOpen} />
      )}
      <AllSessionsRevokeDialog user={user} open={isRevokeAllOpen} onOpenChange={setIsRevokeAllOpen} />
    </SettingsCard>
  );
}
