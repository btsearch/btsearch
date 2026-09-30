import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Copy01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import { useCopyText } from "../copyText";
import { type AuthorizedApp, type OAuthApp, authorizedAppsQueryOptions, oauthAppsQueryOptions } from "../queries";
import { ConfirmDialog } from "./confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  StatusBadge,
} from "./settingsPrimitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { getDateFormatter } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";

type AppType = "web" | "native";

type CreatedCredentials = {
  clientId: string;
  clientSecret?: string;
  rotated: boolean;
};

const APP_TYPES: readonly AppType[] = ["web", "native"];
const APP_TYPE_LABEL_KEYS: Record<AppType, string> = {
  web: "oauth:apps.dialog.typeWeb",
  native: "oauth:apps.dialog.typeNative",
};

function isAppType(value: unknown): value is AppType {
  return APP_TYPES.some((type) => type === value);
}

function parseRedirectUris(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function AppAvatar({ name, logo }: { name: string; logo: string | undefined }) {
  return (
    <Avatar className="size-8 shrink-0 rounded-lg">
      <AvatarImage src={logo} alt="" />
      <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold uppercase">{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation("common");
  const { copied, copy } = useCopyText();

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <code className="min-w-0 flex-1 font-mono text-xs break-all select-all">{value}</code>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions.copy")} onClick={() => copy(value)}>
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
        </Button>
      </div>
    </div>
  );
}

function ClientIdChip({ clientId }: { clientId: string }) {
  const { t } = useTranslation("common");
  const { copied, copy } = useCopyText();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => copy(clientId)}
            aria-label={`${t("actions.copy")}: ${clientId}`}
            className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 font-mono text-[0.72rem] text-foreground transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <span className="truncate">{clientId}</span>
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>{copied ? t("actions.copied") : t("actions.copy")}</TooltipContent>
    </Tooltip>
  );
}

function CredentialsDialog({ credentials, onClose }: { credentials: CreatedCredentials; onClose: () => void }) {
  const { t } = useTranslation("oauth");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="size-5 text-emerald-500" />
            {credentials.rotated ? t("apps.success.rotatedTitle") : t("apps.success.title")}
          </DialogTitle>
        </DialogHeader>
        <CopyField label={t("apps.columns.clientId")} value={credentials.clientId} />
        {credentials.clientSecret ? (
          <>
            <CopyField label={t("apps.success.clientSecret")} value={credentials.clientSecret} />
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
              <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs">{t("apps.success.warning")}</p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("apps.success.publicClientNote")}</p>
        )}
        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {t("common:actions.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (credentials: CreatedCredentials) => void;
}) {
  const { t } = useTranslation(["oauth", "common"]);
  const nameId = useId();
  const redirectsId = useId();
  const homepageId = useId();
  const [name, setName] = useState("");
  const [appType, setAppType] = useState<AppType>("web");
  const [homepage, setHomepage] = useState("");
  const [redirectUris, setRedirectUris] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.oauth2.createClient({
        client_name: name.trim(),
        redirect_uris: parseRedirectUris(redirectUris),
        ...(appType === "native" ? { application_type: "native" as const, token_endpoint_auth_method: "none" as const } : {}),
        ...(homepage.trim() ? { client_uri: homepage.trim() } : {}),
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data) => {
      if (data) onCreated({ clientId: data.client_id, clientSecret: data.client_secret ?? undefined, rotated: false });
      onOpenChange(false);
      setName("");
      setAppType("web");
      setHomepage("");
      setRedirectUris("");
    },
    onError: showSettingsError,
  });

  const canSubmit = name.trim().length > 0 && parseRedirectUris(redirectUris).length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("oauth:apps.dialog.title")}</DialogTitle>
            <DialogDescription>{t("oauth:apps.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>{t("oauth:apps.dialog.nameLabel")}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("oauth:apps.dialog.namePlaceholder")}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("oauth:apps.dialog.typeLabel")}</Label>
            <Select
              value={appType}
              onValueChange={(value) => {
                if (isAppType(value)) setAppType(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{t(APP_TYPE_LABEL_KEYS[appType])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {APP_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(APP_TYPE_LABEL_KEYS[type])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={redirectsId}>{t("oauth:apps.dialog.redirectLabel")}</Label>
            <Textarea
              id={redirectsId}
              value={redirectUris}
              onChange={(event) => setRedirectUris(event.target.value)}
              placeholder={appType === "web" ? t("oauth:apps.dialog.redirectPlaceholder") : t("oauth:apps.dialog.redirectPlaceholderNative")}
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("oauth:apps.dialog.redirectHint")}{" "}
              {appType === "web" ? t("oauth:apps.dialog.redirectHintWeb") : t("oauth:apps.dialog.redirectHintNative")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={homepageId}>
              {t("oauth:apps.dialog.uriLabel")} <span className="font-normal text-muted-foreground">({t("oauth:apps.dialog.optional")})</span>
            </Label>
            <Input
              id={homepageId}
              value={homepage}
              onChange={(event) => setHomepage(event.target.value)}
              placeholder={t("oauth:apps.dialog.uriPlaceholder")}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createMutation.isPending ? <Spinner /> : null}
              {createMutation.isPending ? t("oauth:apps.dialog.creating") : t("oauth:apps.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AuthorizedAppsCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["oauth", "common"]);
  const queryClient = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<AuthorizedApp | null>(null);
  const { data: authorizations, isPending, isError, isFetching, refetch } = useQuery(authorizedAppsQueryOptions(userId));

  const revokeMutation = useMutation({
    mutationFn: (clientId: string) =>
      fetchJson<void>(`${API_BASE}/account/oauth-authorizations/${encodeURIComponent(clientId)}`, { method: "DELETE" }),
    onSuccess: () => {
      setRevokeTarget(null);
      toast.success(t("oauth:authorized.revokeSuccess"));
      void queryClient.invalidateQueries({ queryKey: authorizedAppsQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const dateFormatter = getDateFormatter(i18n.language);

  return (
    <SettingsCard className="h-full">
      <SettingsCardHeader title={t("oauth:authorized.title")} description={t("oauth:authorized.description")} />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : isError ? (
          <SettingsRowError title={t("oauth:authorized.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : authorizations.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("oauth:authorized.none")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("oauth:authorized.noneDescription")}</p>
          </div>
        ) : (
          authorizations.map((authorization) => {
            const name = authorization.app?.client_name ?? authorization.clientId;
            return (
              <SettingsRow
                key={authorization.id}
                media={<AppAvatar name={name} logo={authorization.app?.logo_uri} />}
                title={<span className="break-all">{name}</span>}
                description={
                  <SettingsMeta>
                    <SettingsMetaItem>
                      {t("oauth:authorized.grantedOn", { date: dateFormatter.format(new Date(authorization.createdAt)) })}
                    </SettingsMetaItem>
                    <SettingsMetaItem>{t("oauth:authorized.permissionCount", { count: authorization.scopes.length })}</SettingsMetaItem>
                  </SettingsMeta>
                }
              >
                <Button type="button" variant="outline" size="sm" onClick={() => setRevokeTarget(authorization)}>
                  {t("oauth:authorized.revoke")}
                </Button>
              </SettingsRow>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={t("oauth:authorized.revokeConfirmTitle")}
        description={t("oauth:authorized.revokeConfirmDescription", { name: revokeTarget?.app?.client_name ?? revokeTarget?.clientId ?? "" })}
        confirmLabel={t("oauth:authorized.revoke")}
        pending={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) revokeMutation.mutate(revokeTarget.clientId);
        }}
      />
    </SettingsCard>
  );
}

export function OAuthAppsCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["oauth", "common"]);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [rotateTarget, setRotateTarget] = useState<OAuthApp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OAuthApp | null>(null);
  const { data: apps, isPending, isError, isFetching, refetch } = useQuery(oauthAppsQueryOptions(userId));

  const rotateMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await authClient.oauth2.client.rotateSecret({ client_id: clientId });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      setRotateTarget(null);
      if (data) setCredentials({ clientId: data.client_id, clientSecret: data.client_secret ?? undefined, rotated: true });
    },
    onError: showSettingsError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await authClient.oauth2.deleteClient({ client_id: clientId });
      if (response.error) throw response.error;
    },
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success(t("oauth:apps.deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: oauthAppsQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const dateFormatter = getDateFormatter(i18n.language);

  return (
    <SettingsCard className="h-full">
      <SettingsCardHeader
        title={t("oauth:apps.title")}
        description={t("oauth:apps.description")}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("oauth:apps.createApp")}
          </Button>
        }
      />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : isError ? (
          <SettingsRowError title={t("oauth:apps.errors.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : apps.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("oauth:apps.noApps")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("oauth:apps.noAppsDescription")}</p>
          </div>
        ) : (
          apps.map((app) => {
            const name = app.client_name ?? app.client_id;
            const isNative = app.application_type === "native";
            const isPublicClient = app.token_endpoint_auth_method === "none";
            return (
              <SettingsRow
                key={app.client_id}
                media={<AppAvatar name={name} logo={app.logo_uri} />}
                title={<span className="break-all">{name}</span>}
                badge={
                  <StatusBadge tone={isNative ? "primary" : "muted"}>
                    {isNative ? t("oauth:apps.typeBadge.native") : t("oauth:apps.typeBadge.web")}
                  </StatusBadge>
                }
                description={
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>{t("oauth:apps.columns.clientId")}</span>
                    <ClientIdChip clientId={app.client_id} />
                    {app.client_id_issued_at ? (
                      <>
                        <span aria-hidden="true" className="text-muted-foreground/40">
                          ·
                        </span>
                        <span>{t("common:labels.createdOn", { date: dateFormatter.format(new Date(app.client_id_issued_at * 1000)) })}</span>
                      </>
                    ) : null}
                  </span>
                }
              >
                {isPublicClient ? null : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRotateTarget(app)}>
                    {t("oauth:apps.rotateSecret")}
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common:actions.delete")}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
                        onClick={() => setDeleteTarget(app)}
                      />
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </TooltipTrigger>
                  <TooltipContent>{t("common:actions.delete")}</TooltipContent>
                </Tooltip>
              </SettingsRow>
            );
          })
        )}
      </div>

      <CreateAppDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setCredentials(created);
          void queryClient.invalidateQueries({ queryKey: oauthAppsQueryOptions(userId).queryKey });
        }}
      />
      {credentials !== null ? <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} /> : null}
      <ConfirmDialog
        open={rotateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
        destructive={false}
        title={t("oauth:apps.rotateConfirmTitle")}
        description={t("oauth:apps.rotateConfirmDescription", { name: rotateTarget?.client_name ?? rotateTarget?.client_id ?? "" })}
        confirmLabel={t("oauth:apps.rotateSecret")}
        pending={rotateMutation.isPending}
        onConfirm={() => {
          if (rotateTarget !== null) rotateMutation.mutate(rotateTarget.client_id);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("oauth:apps.deleteConfirmTitle")}
        description={t("oauth:apps.deleteConfirmDescription", { name: deleteTarget?.client_name ?? deleteTarget?.client_id ?? "" })}
        confirmLabel={t("common:actions.delete")}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget.client_id);
        }}
      />
    </SettingsCard>
  );
}
