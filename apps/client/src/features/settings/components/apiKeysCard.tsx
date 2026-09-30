import { Add01Icon, Alert02Icon, CheckmarkCircle02Icon, Copy01Icon, Key01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import { useCopyText } from "../copyText";
import { type ApiKeyInfo, type UsageWindow, apiKeysQueryOptions, isPublishableKey } from "../queries";
import { ConfirmDialog } from "./confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsCardNote,
  SettingsIconTile,
  SettingsRowError,
  SettingsRowSkeleton,
  StatusBadge,
} from "./settingsPrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth/client";
import { getDateFormatter } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS = ["1d", "3d", "7d", "30d", "90d", "1y", "never"] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

const EXPIRY_SECONDS: Record<Exclude<ExpiryOption, "never">, number> = {
  "1d": 86400,
  "3d": 259200,
  "7d": 604800,
  "30d": 2592000,
  "90d": 7776000,
  "1y": 31536000,
};

const API_KEY_NAME_MAX_LENGTH = 32;

function isExpiryOption(value: unknown): value is ExpiryOption {
  return EXPIRY_OPTIONS.some((option) => option === value);
}

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return value.toString();
}

function UsageMeter({ label, usage }: { label: string; usage: UsageWindow }) {
  const { t } = useTranslation("settings");
  const percent = usage.max !== null && usage.max > 0 ? Math.min((usage.used / usage.max) * 100, 100) : 0;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-xs leading-4 text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-foreground tabular-nums">
          {usage.max === null ? t("apiKeys.usage.unlimited") : `${formatCount(usage.used)} / ${formatCount(usage.max)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", percent > 60 ? "bg-destructive" : "bg-muted-foreground/40")} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function KeyCreatedDialog({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const { copied, copy } = useCopyText();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="size-5 text-emerald-500" />
            {t("apiKeys.success.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <code className="min-w-0 flex-1 font-mono text-xs break-all select-all">{apiKey}</code>
          <Button variant="ghost" size="icon-sm" aria-label={t("common:actions.copy")} onClick={() => copy(apiKey)}>
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
          </Button>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs">{t("apiKeys.success.warning")}</p>
        </div>
        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {t("common:actions.done")}
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
  const nameId = useId();
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState<ExpiryOption>("7d");

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.apiKey.create({
        name: name.trim(),
        expiresIn: expiresIn === "never" ? undefined : EXPIRY_SECONDS[expiresIn],
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.key) onCreated(data.key);
      onOpenChange(false);
      setName("");
      setExpiresIn("7d");
    },
    onError: showSettingsError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) createMutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("apiKeys.createKey")}</DialogTitle>
            <DialogDescription>{t("apiKeys.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>{t("common:labels.name")}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("apiKeys.dialog.namePlaceholder")}
              maxLength={API_KEY_NAME_MAX_LENGTH}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("apiKeys.dialog.expiresLabel")}</Label>
            <Select
              value={expiresIn}
              onValueChange={(value) => {
                if (isExpiryOption(value)) setExpiresIn(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{t(`apiKeys.dialog.expiresOptions.${expiresIn}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`apiKeys.dialog.expiresOptions.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Spinner /> : null}
              {createMutation.isPending ? t("apiKeys.dialog.creating") : t("apiKeys.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyRow({ apiKey, formatDate, onRevoke }: { apiKey: ApiKeyInfo; formatDate: (value: string) => string; onRevoke: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const publishable = isPublishableKey(apiKey);

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex min-w-0 flex-[1_1_15rem] items-center gap-3.5">
        <SettingsIconTile icon={Key01Icon} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm leading-5 font-medium">{apiKey.name ?? t("apiKeys.unnamed")}</p>
            <StatusBadge tone={publishable ? "primary" : "muted"}>
              {publishable ? t("apiKeys.typeBadge.publishable") : t("apiKeys.typeBadge.secret")}
            </StatusBadge>
          </div>
          <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("common:labels.createdOn", { date: formatDate(apiKey.createdAt) })}</p>
        </div>
      </div>
      <div className="w-32">
        <p className="text-xs leading-4 text-muted-foreground">{t("apiKeys.columns.key")}</p>
        <code className="mt-1 inline-flex h-5 items-center rounded-md bg-muted px-1.5 font-mono text-[0.72rem]">
          {apiKey.start ?? "-"}
          <span aria-hidden="true" className="text-muted-foreground">
            ••••
          </span>
        </code>
      </div>
      <div className="w-28">
        <p className="text-xs leading-4 text-muted-foreground">{t("apiKeys.columns.expires")}</p>
        <p className="mt-1 text-sm leading-5 font-medium">
          {publishable || apiKey.expiresAt === null ? t("common:status.never") : formatDate(apiKey.expiresAt)}
        </p>
      </div>
      <div className="flex w-full min-w-0 gap-4 sm:w-80">
        <UsageMeter label={t("apiKeys.usage.perMinute")} usage={apiKey.rateLimit} />
        {publishable ? null : <UsageMeter label={t("apiKeys.usage.weekly")} usage={apiKey.quota} />}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
        onClick={onRevoke}
      >
        {t("common:actions.revoke")}
      </Button>
    </div>
  );
}

export function ApiKeysCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { data, isPending, isError, isFetching, refetch } = useQuery(apiKeysQueryOptions(userId));
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({ keyId });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      setRevokeTarget(null);
      toast.success(t("apiKeys.revokeSuccess"));
      void queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const dateFormatter = getDateFormatter(i18n.language);
  const formatDate = (value: string) => dateFormatter.format(new Date(value));

  const keys = data?.keys ?? [];
  const limits = data?.limits;
  const secretKeyCount = keys.filter((key) => !isPublishableKey(key)).length;
  const maxKeys = limits?.maxKeys ?? null;
  const limitReached = maxKeys !== null && secretKeyCount >= maxKeys;
  const nextCreateAt = limits?.nextCreateAt ?? null;
  const createBlockedReason = limitReached
    ? t("apiKeys.limitReached")
    : nextCreateAt !== null
      ? t("apiKeys.nextCreateAt", { date: formatDate(nextCreateAt) })
      : null;

  const createButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={data === undefined || createBlockedReason !== null}
      onClick={() => setCreateOpen(true)}
    >
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("apiKeys.createKey")}
    </Button>
  );

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("apiKeys.title")}
        description={t("apiKeys.description")}
        action={
          <>
            {maxKeys !== null ? (
              <span className="text-xs text-muted-foreground tabular-nums">{t("apiKeys.counter", { count: secretKeyCount, max: maxKeys })}</span>
            ) : null}
            {createBlockedReason !== null ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>{createButton}</TooltipTrigger>
                <TooltipContent>{createBlockedReason}</TooltipContent>
              </Tooltip>
            ) : (
              createButton
            )}
          </>
        }
      />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : isError ? (
          <SettingsRowError title={t("apiKeys.errors.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : keys.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("apiKeys.noKeys")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("apiKeys.noKeysDescription")}</p>
          </div>
        ) : (
          keys.map((key) => <ApiKeyRow key={key.id} apiKey={key} formatDate={formatDate} onRevoke={() => setRevokeTarget(key)} />)
        )}
      </div>
      {limits ? (
        <SettingsCardNote>
          {maxKeys === null ? t("apiKeys.unlimitedNote") : t("apiKeys.limitNote", { count: maxKeys })}
          {nextCreateAt !== null ? <span className="block">{t("apiKeys.nextCreateAt", { date: formatDate(nextCreateAt) })}</span> : null}
        </SettingsCardNote>
      ) : null}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => {
          setCreatedKey(key);
          void queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions(userId).queryKey });
        }}
      />
      {createdKey !== null ? <KeyCreatedDialog apiKey={createdKey} onClose={() => setCreatedKey(null)} /> : null}
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={t("apiKeys.revokeConfirmTitle")}
        description={t("apiKeys.revokeConfirmDescription", { name: revokeTarget?.name ?? t("apiKeys.unnamed") })}
        confirmLabel={t("common:actions.revoke")}
        pending={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) revokeMutation.mutate(revokeTarget.id);
        }}
      />
    </SettingsCard>
  );
}
