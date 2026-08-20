import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

type ApiKeyInfo = {
  id: string;
  name: string | null;
  start: string | null;
  expiresAt: string | null;
  createdAt: string;
  enabled: boolean | null;
  rateLimit: {
    used: number;
    max: number | null;
    window: number;
    reset: number | null;
  };
  quota: {
    used: number;
    max: number | null;
    window: number;
    reset: number | null;
  };
};

const EXPIRY_OPTIONS = ["1d", "3d", "7d", "30d", "90d", "1y", "never"] as const;
const MAX_KEYS = 1;

function isPublishableKey(key: ApiKeyInfo): boolean {
  return key.start?.startsWith("pk_") ?? false;
}

const EXPIRY_SECONDS: Record<string, number> = {
  "1d": 86400,
  "3d": 259200,
  "7d": 604800,
  "30d": 2592000,
  "90d": 7776000,
  "1y": 31536000,
};

function formatResetTime(resetUnix: number): string {
  const diff = Math.max(0, resetUnix - Math.floor(Date.now() / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.ceil(diff / 60)}m`;
  if (diff < 86400) return `${Math.ceil(diff / 3600)}h`;
  return `${Math.ceil(diff / 86400)}d`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toString();
}

const UsageBar = memo(function UsageBar({ used, max, reset, label }: { used: number; max: number; reset: number | null; label?: string }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const isHigh = pct > 60;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs tabular-nums">
          {label ? <span className="text-muted-foreground">{label} </span> : null}
          {formatNumber(used)} / {formatNumber(max)}
        </span>
        {reset !== null && used > 0 ? <span className="text-[10px] text-muted-foreground tabular-nums">{formatResetTime(reset)}</span> : null}
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn(`h-full transition-all`, isHigh ? "bg-destructive" : "bg-muted-foreground/30")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});

function KeyCreatedDialog({ apiKey, open, onClose }: { apiKey: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation("settings");
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-6 rounded-full bg-emerald-500/10 text-emerald-500">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
            </div>
            <DialogTitle>{t("apiKeys.success.title")}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <code className="flex-1 text-xs font-mono break-all select-all">{apiKey}</code>
          <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 mt-0.5 shrink-0" />
          <p className="text-xs">{t("apiKeys.success.warning")}</p>
        </div>

        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {t("apiKeys.success.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState("7d");

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.apiKey.create({
        name: name.trim(),
        expiresIn: EXPIRY_SECONDS[expiresIn],
      });
      if (result.error) throw new Error(result.error.message ?? t("apiKeys.errors.createFailed"));
      return result.data;
    },
    onSuccess: (data) => {
      onCreated(data?.key ?? "");
      onOpenChange(false);
      setName("");
      setExpiresIn("7d");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("apiKeys.dialog.title")}</DialogTitle>
          <DialogDescription>{t("apiKeys.dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">{t("apiKeys.dialog.nameLabel")}</Label>
            <Input
              id="api-key-name"
              placeholder={t("apiKeys.dialog.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("apiKeys.dialog.expiresLabel")}</Label>
            <Select value={expiresIn} onValueChange={(v) => v && setExpiresIn(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {t(`apiKeys.dialog.expiresOptions.${opt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
              {EXPIRY_OPTIONS.map((opt, i) => (
                <span key={opt}>
                  <button
                    type="button"
                    onClick={() => setExpiresIn(opt)}
                    className={cn(
                      "text-xs transition-colors",
                      expiresIn === opt ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`apiKeys.dialog.expiresOptions.${opt}`)}
                  </button>
                  {i < EXPIRY_OPTIONS.length - 1 && <span className="text-muted-foreground/50 text-xs ml-1.5">·</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Spinner />
                {t("apiKeys.dialog.creating")}
              </>
            ) : (
              t("apiKeys.dialog.create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["account", "api-keys", userId],
    queryFn: () => fetchJson<{ data: ApiKeyInfo[] }>(`${API_BASE}/account/api-keys`).then((r) => r.data),
  });

  const secretKeys = keys.filter((k) => !isPublishableKey(k));
  const publishableKeys = keys.filter(isPublishableKey);

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({ keyId });
      if (result.error) throw new Error(result.error.message ?? "Failed to revoke key");
    },
    onSuccess: () => {
      toast.success(t("apiKeys.revokeSuccess"));
      setRevokeTarget(null);
      void qc.invalidateQueries({ queryKey: ["account", "api-keys", userId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreated(key: string) {
    setCreatedKey(key);
    void qc.invalidateQueries({ queryKey: ["account", "api-keys", userId] });
  }

  function formatDate(dateStr: string) {
    return new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", year: "numeric" }).format(new Date(dateStr));
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
        {keys.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium">{t("apiKeys.noKeys")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("apiKeys.noKeysDescription")}</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" className="size-3.5" />
              {t("apiKeys.createKey")}
            </Button>
          </CardContent>
        ) : (
          <>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 pb-2">{t("apiKeys.columns.name")}</th>
                      <th className="text-left font-medium px-4 pb-2">{t("apiKeys.columns.key")}</th>
                      <th className="text-left font-medium px-4 pb-2">{t("apiKeys.columns.expires")}</th>
                      <th className="text-left font-medium px-4 pb-2">{t("apiKeys.columns.usage")}</th>
                      <th className="px-4 pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const isPk = isPublishableKey(key);
                      return (
                        <tr key={key.id} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm">{key.name ?? "Unnamed"}</p>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  isPk ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground",
                                )}
                              >
                                {t(isPk ? "apiKeys.typeBadge.publishable" : "apiKeys.typeBadge.secret")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{t("apiKeys.created", { date: formatDate(key.createdAt) })}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono">{key.start ?? "-"}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {isPk ? (
                              <span className="text-xs text-muted-foreground">{t("common:status.never")}</span>
                            ) : key.expiresAt ? (
                              <span className="text-xs">{formatDate(key.expiresAt)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                {t("apiKeys.expiresNever")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 min-w-32">
                            <div className="space-y-2">
                              {key.rateLimit.max !== null ? (
                                <UsageBar
                                  used={key.rateLimit.used}
                                  max={key.rateLimit.max}
                                  reset={key.rateLimit.reset}
                                  label={t("apiKeys.usage.minute")}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">{t("apiKeys.usage.minute")} ∞</span>
                              )}
                              {!isPk && (
                                <>
                                  {key.quota.max !== null ? (
                                    <UsageBar used={key.quota.used} max={key.quota.max} reset={key.quota.reset} label={t("apiKeys.usage.weekly")} />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{t("apiKeys.usage.weekly")} ∞</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Button
                              variant="outline"
                              size="xs"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                              onClick={() => setRevokeTarget(key)}
                            >
                              {t("apiKeys.revokeKey")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="text-xs text-muted-foreground">
                {t("apiKeys.keysUsed", { count: secretKeys.length, max: MAX_KEYS })}
                {" · "}
                {t("apiKeys.pkKeysCount", { count: publishableKeys.length })}
              </span>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" className="size-3.5" />
                {t("apiKeys.createKey")}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

      {createdKey !== null ? <KeyCreatedDialog apiKey={createdKey} open onClose={() => setCreatedKey(null)} /> : null}

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKeys.revokeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("apiKeys.revokeConfirmDescription", { name: revokeTarget?.name ?? "Unnamed" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
            >
              {revokeMutation.isPending ? (
                <>
                  <Spinner />
                  {t("apiKeys.revoking")}
                </>
              ) : (
                t("apiKeys.revokeKey")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
