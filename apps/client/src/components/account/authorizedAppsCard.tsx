import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { getDateFormatter } from "@/lib/dateFormat";

type Consent = {
  id: string;
  clientId: string;
  scopes: string[];
  createdAt: string;
};

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
};

type AuthorizedApp = Consent & { app: PublicClient | null };

export function AuthorizedAppsCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["oauth", "common"]);
  const qc = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<AuthorizedApp | null>(null);

  const queryKey = ["account", "oauth-authorizations", userId];

  const { data: authorizations = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await authClient.oauth2.getConsents();
      if (res.error) throw new Error(res.error.message ?? "Failed to load authorizations");
      const consents = (res.data ?? []) as Consent[];
      return Promise.all(
        consents.map(async (consent): Promise<AuthorizedApp> => {
          const appRes = await authClient.oauth2.publicClient({ query: { client_id: consent.clientId } });
          return { ...consent, app: appRes.error ? null : (appRes.data as PublicClient) };
        }),
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      await fetchJson(`${API_BASE}/account/oauth-authorizations/${encodeURIComponent(clientId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success(t("oauth:authorized.revokeSuccess"));
      setRevokeTarget(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function formatDate(dateStr: string) {
    return getDateFormatter(i18n.language).format(new Date(dateStr));
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

  if (authorizations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm font-medium">{t("oauth:authorized.none")}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{t("oauth:authorized.noneDescription")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-0">
        <CardContent className="p-0">
          <ItemGroup className="gap-0">
            {authorizations.map((authorization, i) => {
              const name = authorization.app?.client_name ?? authorization.clientId;
              return (
                <Fragment key={authorization.id}>
                  {i > 0 ? <ItemSeparator /> : null}
                  <Item>
                    <ItemMedia>
                      <Avatar className="size-8 rounded-lg">
                        <AvatarImage src={authorization.app?.logo_uri} alt="" />
                        <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold uppercase">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{name}</ItemTitle>
                      <ItemDescription>
                        {t("oauth:authorized.grantedOn", { date: formatDate(authorization.createdAt) })}
                        {" · "}
                        {t("oauth:authorized.permissionCount", { count: authorization.scopes.length })}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                        onClick={() => setRevokeTarget(authorization)}
                      >
                        {t("oauth:authorized.revoke")}
                      </Button>
                    </ItemActions>
                  </Item>
                </Fragment>
              );
            })}
          </ItemGroup>
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oauth:authorized.revokeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("oauth:authorized.revokeConfirmDescription", { name: revokeTarget?.app?.client_name ?? revokeTarget?.clientId })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.clientId)}
            >
              {revokeMutation.isPending ? (
                <>
                  <Spinner />
                  {t("oauth:authorized.revoking")}
                </>
              ) : (
                t("oauth:authorized.revoke")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
