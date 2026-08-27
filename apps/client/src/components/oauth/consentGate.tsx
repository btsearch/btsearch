import type { DialogRootChangeEventDetails } from "@base-ui/react/dialog";
import {
  Alert02Icon,
  ArrowDataTransferHorizontalIcon,
  Clock01Icon,
  Globe02Icon,
  PencilEdit01Icon,
  ShieldUserIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AuthDialog } from "@/components/auth/authDialog";
import { groupScopes, scopeKey } from "@/components/oauth/scopes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/authClient";

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
};

const BLOCKED_REASONS = new Set(["escape-key", "close-press", "outside-press", "focus-out"]);

function blockDismiss(nextOpen: boolean, details: DialogRootChangeEventDetails) {
  if (!nextOpen && BLOCKED_REASONS.has(details.reason)) return;
}

function hostOf(uri: string | undefined) {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

function ScopeSectionLabel({ children }: { children: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</p>;
}

function ConsentDialogBody({ clientId, requestedScopes, redirectUri }: { clientId: string; requestedScopes: string[]; redirectUri?: string }) {
  const { t } = useTranslation("oauth");
  const { data: session } = authClient.useSession();
  const [action, setAction] = useState<"allow" | "deny" | null>(null);

  const {
    data: app,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["oauth", "public-client", clientId],
    queryFn: async () => {
      const res = await authClient.oauth2.publicClient({ query: { client_id: clientId } });
      if (res.error) throw new Error(res.error.message ?? "client not found");
      return res.data as PublicClient;
    },
    retry: false,
  });

  const consentMutation = useMutation({
    mutationFn: async (accept: boolean) => {
      const res = await authClient.oauth2.consent({ accept });
      if (res.error) throw new Error(res.error.message ?? t("authorize.error"));
      return res.data as { redirect?: boolean; url?: string } | null;
    },
    onSuccess: (data) => {
      if (data?.url) window.location.assign(data.url);
      else window.location.assign("/");
    },
    onError: (err: Error) => {
      setAction(null);
      toast.error(err.message || t("authorize.error"));
    },
  });

  function decide(accept: boolean) {
    setAction(accept ? "allow" : "deny");
    consentMutation.mutate(accept);
  }

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Skeleton className="size-14 rounded-full shrink-0" />
          <Skeleton className="h-px w-10" />
          <Skeleton className="size-14 rounded-xl shrink-0" />
        </div>
        <Skeleton className="h-5 w-3/4 mx-auto" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </>
    );
  }

  if (isError || !app) return <InvalidRequest />;

  const appName = app.client_name ?? t("authorize.unknownApp");
  const userName = session?.user ? (session.user.username ?? session.user.name) : null;
  const appDomain = hostOf(app.client_uri) ?? hostOf(redirectUri);
  const redirectDomain = hostOf(redirectUri);
  const grouped = groupScopes(requestedScopes);
  const pending = consentMutation.isPending;

  return (
    <>
      <DialogHeader className="items-center">
        <div className="flex items-start justify-center gap-2 pt-1">
          <div className="flex w-24 flex-col items-center gap-1.5">
            <Avatar className="size-14">
              <AvatarImage src={session?.user.image ?? undefined} alt="" />
              <AvatarFallback className="bg-muted text-lg font-semibold uppercase">{userName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <p className="w-full truncate text-center text-xs font-medium">{userName}</p>
          </div>
          <div className="flex h-14 items-center gap-1 text-muted-foreground/60" aria-hidden="true">
            <span className="h-px w-3 bg-border" />
            <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} className="size-4" />
            <span className="h-px w-3 bg-border" />
          </div>
          <div className="flex w-24 flex-col items-center gap-1.5">
            <Avatar className="size-14 rounded-xl">
              <AvatarImage src={app.logo_uri} alt="" />
              <AvatarFallback className="rounded-xl bg-muted text-lg font-semibold uppercase">{appName.charAt(0)}</AvatarFallback>
            </Avatar>
            <p className="w-full truncate text-center text-xs font-medium">{appName}</p>
          </div>
        </div>
        <DialogTitle className="text-center text-base text-balance">{t("authorize.wantsAccess", { app: appName })}</DialogTitle>
        {appDomain ? (
          <p className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Globe02Icon} className="size-3" />
            {appDomain}
          </p>
        ) : null}
      </DialogHeader>

      <div className="rounded-xl border divide-y overflow-hidden">
        {grouped.identity.length > 0 ? (
          <div className="px-3 py-2.5 space-y-1.5">
            <ScopeSectionLabel>{t("authorize.accountAccess")}</ScopeSectionLabel>
            {grouped.identity.map((scope) => (
              <div key={scope} className="flex items-center gap-2 text-sm">
                <HugeiconsIcon icon={ShieldUserIcon} className="size-3.5 text-muted-foreground shrink-0" />
                {t(`authorize.scopes.${scopeKey(scope)}`)}
              </div>
            ))}
          </div>
        ) : null}

        {grouped.read.length > 0 ? (
          <div className="px-3 py-2.5 space-y-1.5">
            <ScopeSectionLabel>{t("authorize.readAccess")}</ScopeSectionLabel>
            <div className="flex flex-wrap gap-1">
              {grouped.read.map((scope) => (
                <span key={scope} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  <HugeiconsIcon icon={Tick02Icon} className="size-3 text-muted-foreground" />
                  {t(`authorize.scopes.${scopeKey(scope)}`)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {grouped.write.length > 0 || grouped.unknown.length > 0 ? (
          <div className="px-3 py-2.5 space-y-1.5">
            <ScopeSectionLabel>{t("authorize.writeAccess")}</ScopeSectionLabel>
            {grouped.write.map((scope) => (
              <div key={scope} className="flex items-center gap-2 text-sm font-medium">
                <HugeiconsIcon icon={PencilEdit01Icon} className="size-3.5 shrink-0" />
                {t(`authorize.scopes.${scopeKey(scope)}`)}
              </div>
            ))}
            {grouped.unknown.map((scope) => (
              <div key={scope} className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" />
                <code className="text-xs font-mono">{scope}</code>
              </div>
            ))}
          </div>
        ) : null}

        {grouped.offline ? (
          <div className="px-3 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Clock01Icon} className="size-3.5 shrink-0" />
            {t("authorize.offlineAccess")}
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        {redirectDomain ? (
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="authorize.redirectNotice"
              values={{ domain: redirectDomain }}
              components={{ strong: <strong className="text-foreground font-medium" /> }}
            />
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="authorize.revokeNotice"
            components={{
              settingsLink: (
                <Link
                  to="/settings"
                  search={{ tab: "security" }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground font-medium underline underline-offset-4 hover:text-primary"
                />
              ),
            }}
          />
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" className="w-full sm:w-auto" disabled={pending} onClick={() => decide(false)}>
          {action === "deny" && pending ? (
            <>
              <Spinner />
              {t("authorize.denying")}
            </>
          ) : (
            t("authorize.deny")
          )}
        </Button>
        <Button className="w-full sm:w-auto" disabled={pending} onClick={() => decide(true)}>
          {action === "allow" && pending ? (
            <>
              <Spinner />
              {t("authorize.allowing")}
            </>
          ) : (
            t("authorize.allow")
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

function InvalidRequest() {
  const { t } = useTranslation("oauth");
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-6 rounded-full bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} className="size-4" />
          </div>
          <DialogTitle>{t("authorize.invalidTitle")}</DialogTitle>
        </div>
        <DialogDescription>{t("authorize.invalidDescription")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button className="w-full sm:w-auto">
          <Link to="/">{t("authorize.backHome")}</Link>
        </Button>
      </DialogFooter>
    </>
  );
}

export function OAuthConsentGate() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { data: session, isPending } = authClient.useSession();

  const params = new URLSearchParams(searchStr);
  const clientId = params.get("client_id");
  const isOAuthRedirect = !!clientId && params.has("sig");

  if (!isOAuthRedirect || isPending) return null;
  if (!session?.user) return <AuthDialog open forced onOpenChange={() => {}} />;

  const requestedScopes = params.get("scope")?.split(" ").filter(Boolean) ?? [];
  const redirectUri = params.get("redirect_uri") ?? undefined;

  return (
    <Dialog open onOpenChange={blockDismiss} modal>
      <DialogContent showCloseButton={false} className="max-w-sm sm:max-w-md">
        <ConsentDialogBody clientId={clientId} requestedScopes={requestedScopes} redirectUri={redirectUri} />
      </DialogContent>
    </Dialog>
  );
}
