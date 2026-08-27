import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/authClient";
import { getDateFormatter } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";

type AppType = "web" | "native";

const APP_TYPE_LABEL_KEYS: Record<AppType, string> = {
  web: "oauth:apps.dialog.typeWeb",
  native: "oauth:apps.dialog.typeNative",
};
const APP_TYPES = Object.keys(APP_TYPE_LABEL_KEYS) as AppType[];

type OAuthApp = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris: string[];
  client_id_issued_at?: number;
  application_type?: string;
  token_endpoint_auth_method?: string;
};

type CreatedCredentials = {
  clientId: string;
  clientSecret?: string;
  rotated: boolean;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <code className="flex-1 text-xs font-mono break-all select-all">{value}</code>
        <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CredentialsDialog({ credentials, onClose }: { credentials: CreatedCredentials; onClose: () => void }) {
  const { t } = useTranslation("oauth");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-6 rounded-full bg-emerald-500/10 text-emerald-500">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
            </div>
            <DialogTitle>{credentials.rotated ? t("apps.success.rotatedTitle") : t("apps.success.title")}</DialogTitle>
          </div>
        </DialogHeader>

        <CopyField label={t("apps.success.clientId")} value={credentials.clientId} />
        {credentials.clientSecret ? <CopyField label={t("apps.success.clientSecret")} value={credentials.clientSecret} /> : null}

        {credentials.clientSecret ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
            <HugeiconsIcon icon={Alert02Icon} className="size-4 mt-0.5 shrink-0" />
            <p className="text-xs">{t("apps.success.warning")}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("apps.success.publicClientNote")}</p>
        )}

        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {t("apps.success.done")}
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
  const [name, setName] = useState("");
  const [appType, setAppType] = useState<AppType>("web");
  const [homepage, setHomepage] = useState("");
  const [redirectUris, setRedirectUris] = useState("");

  const parsedRedirectUris = redirectUris
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.oauth2.createClient({
        client_name: name.trim(),
        redirect_uris: parsedRedirectUris,
        ...(appType === "native" ? { application_type: "native" as const, token_endpoint_auth_method: "none" as const } : {}),
        ...(homepage.trim() ? { client_uri: homepage.trim() } : {}),
      });
      if (res.error) throw new Error(res.error.message ?? t("oauth:apps.errors.createFailed"));
      return res.data as { client_id: string; client_secret?: string };
    },
    onSuccess: (data) => {
      onCreated({ clientId: data.client_id, clientSecret: data.client_secret, rotated: false });
      onOpenChange(false);
      setName("");
      setAppType("web");
      setHomepage("");
      setRedirectUris("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = name.trim().length > 0 && parsedRedirectUris.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("oauth:apps.dialog.title")}</DialogTitle>
          <DialogDescription>{t("oauth:apps.dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="oauth-app-name">{t("oauth:apps.dialog.nameLabel")}</Label>
            <Input
              id="oauth-app-name"
              placeholder={t("oauth:apps.dialog.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("oauth:apps.dialog.typeLabel")}</Label>
            <Select value={appType} onValueChange={(v) => v && setAppType(v as AppType)}>
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
            <Label htmlFor="oauth-app-redirects">{t("oauth:apps.dialog.redirectLabel")}</Label>
            <Textarea
              id="oauth-app-redirects"
              placeholder={appType === "web" ? t("oauth:apps.dialog.redirectPlaceholder") : t("oauth:apps.dialog.redirectPlaceholderNative")}
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("oauth:apps.dialog.redirectHint")}{" "}
              {appType === "web" ? t("oauth:apps.dialog.redirectHintWeb") : t("oauth:apps.dialog.redirectHintNative")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oauth-app-homepage">
              {t("oauth:apps.dialog.uriLabel")} <span className="text-muted-foreground font-normal">({t("oauth:apps.dialog.optional")})</span>
            </Label>
            <Input
              id="oauth-app-homepage"
              placeholder={t("oauth:apps.dialog.uriPlaceholder")}
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Spinner />
                {t("oauth:apps.dialog.creating")}
              </>
            ) : (
              t("oauth:apps.dialog.create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OAuthAppsCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["oauth", "common"]);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [rotateTarget, setRotateTarget] = useState<OAuthApp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OAuthApp | null>(null);

  const queryKey = ["account", "oauth-apps", userId];

  const { data: apps = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await authClient.oauth2.getClients();
      if (res.error) throw new Error(res.error.message ?? "Failed to load applications");
      return (res.data ?? []) as OAuthApp[];
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await authClient.oauth2.client.rotateSecret({ client_id: clientId });
      if (res.error) throw new Error(res.error.message ?? "Failed to rotate secret");
      return res.data as { client_id: string; client_secret?: string };
    },
    onSuccess: (data) => {
      setRotateTarget(null);
      setCredentials({ clientId: data.client_id, clientSecret: data.client_secret, rotated: true });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await authClient.oauth2.deleteClient({ client_id: clientId });
      if (res.error) throw new Error(res.error.message ?? "Failed to delete application");
    },
    onSuccess: () => {
      toast.success(t("oauth:apps.deleteSuccess"));
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreated(created: CreatedCredentials) {
    setCredentials(created);
    void qc.invalidateQueries({ queryKey });
  }

  function formatDate(unixSeconds: number) {
    return getDateFormatter(i18n.language).format(new Date(unixSeconds * 1000));
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="gap-0">
        {apps.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium">{t("oauth:apps.noApps")}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{t("oauth:apps.noAppsDescription")}</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" className="size-3.5" />
              {t("oauth:apps.createApp")}
            </Button>
          </CardContent>
        ) : (
          <>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 pb-2">{t("oauth:apps.columns.name")}</th>
                      <th className="text-left font-medium px-4 pb-2">{t("oauth:apps.columns.clientId")}</th>
                      <th className="px-4 pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((app) => {
                      const name = app.client_name ?? app.client_id;
                      const isNative = app.application_type === "native";
                      const isPublicClient = app.token_endpoint_auth_method === "none";
                      return (
                        <tr key={app.client_id} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="size-8 rounded-lg shrink-0">
                                <AvatarImage src={app.logo_uri} alt="" />
                                <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold uppercase">{name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-medium text-sm truncate">{name}</p>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                      isNative ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {t(isNative ? "oauth:apps.typeBadge.native" : "oauth:apps.typeBadge.web")}
                                  </span>
                                </div>
                                {app.client_id_issued_at ? (
                                  <p className="text-xs text-muted-foreground">
                                    {t("oauth:apps.createdOn", { date: formatDate(app.client_id_issued_at) })}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono">{app.client_id}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              {isPublicClient ? null : (
                                <Button variant="outline" size="xs" onClick={() => setRotateTarget(app)}>
                                  {t("oauth:apps.rotateSecret")}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="xs"
                                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                                onClick={() => setDeleteTarget(app)}
                              >
                                {t("oauth:apps.deleteApp")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" className="size-3.5" />
                {t("oauth:apps.createApp")}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>

      <CreateAppDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

      {credentials !== null ? <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} /> : null}

      <AlertDialog open={!!rotateTarget} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oauth:apps.rotateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("oauth:apps.rotateConfirmDescription", { name: rotateTarget?.client_name ?? rotateTarget?.client_id })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={rotateMutation.isPending} onClick={() => rotateTarget && rotateMutation.mutate(rotateTarget.client_id)}>
              {rotateMutation.isPending ? (
                <>
                  <Spinner />
                  {t("oauth:apps.rotating")}
                </>
              ) : (
                t("oauth:apps.rotateSecret")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oauth:apps.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("oauth:apps.deleteConfirmDescription", { name: deleteTarget?.client_name ?? deleteTarget?.client_id })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.client_id)}
            >
              {deleteMutation.isPending ? (
                <>
                  <Spinner />
                  {t("oauth:apps.deleting")}
                </>
              ) : (
                t("oauth:apps.deleteApp")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
