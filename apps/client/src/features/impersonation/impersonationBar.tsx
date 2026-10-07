import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { showImpersonationError, stopImpersonation } from "./api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettledSession } from "@/hooks/useSettledSession";

type ImpersonatedUser = { id: string; name: string; username?: string | null };

function ActiveImpersonationBar({ user, expiresAt }: { user: ImpersonatedUser; expiresAt: Date }) {
  const { t, i18n } = useTranslation("common");

  const stopMutation = useMutation({
    mutationFn: stopImpersonation,
    onSuccess: () => window.location.assign(`/admin/users/${user.id}`),
    onError: showImpersonationError,
  });

  const isStopping = stopMutation.isPending || stopMutation.isSuccess;
  const sessionEnd = new Date(expiresAt).toLocaleTimeString(i18n.language, { timeStyle: "short" });

  return (
    <div
      role="status"
      className="flex min-h-10 shrink-0 items-center gap-2.5 border-b border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-sm sm:px-6 lg:px-8"
    >
      <HugeiconsIcon icon={UserSwitchIcon} aria-hidden="true" className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <p className="min-w-0 flex-1 wrap-anywhere">
        {t("impersonation.actingAs")} <span className="font-semibold">{user.name}</span>
        {user.username ? <span className="text-muted-foreground max-sm:hidden"> @{user.username}</span> : null}{" "}
        <span aria-hidden="true" className="text-muted-foreground/40">
          ·
        </span>{" "}
        <span className="whitespace-nowrap text-muted-foreground">{t("impersonation.sessionUntil", { time: sessionEnd })}</span>
      </p>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isStopping}
              className="cursor-pointer"
              onClick={() => stopMutation.mutate()}
            />
          }
        >
          {isStopping ? <Spinner /> : null}
          {t("impersonation.stop")}
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("impersonation.stopHint")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ImpersonationBar() {
  const { data: session } = useSettledSession();
  if (!session?.session.impersonatedBy) return null;

  return <ActiveImpersonationBar user={session.user} expiresAt={session.session.expiresAt} />;
}
