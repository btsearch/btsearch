import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { showImpersonationError, startImpersonation } from "./api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";

type ImpersonationTarget = { id: string; name: string };

function ImpersonateLabel() {
  const { t } = useTranslation("common");

  return (
    <>
      <HugeiconsIcon icon={UserSwitchIcon} data-icon="inline-start" aria-hidden="true" />
      {t("impersonation.start")}
    </>
  );
}

function UnavailableImpersonateButton({ reason }: { reason: string }) {
  const reasonId = useId();

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
        <Button type="button" variant="outline" disabled aria-describedby={reasonId} className="flex-1">
          <ImpersonateLabel />
        </Button>
        <span id={reasonId} hidden>
          {reason}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function AvailableImpersonateButton({ user }: { user: ImpersonationTarget }) {
  const { t } = useTranslation("common");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const startMutation = useMutation({
    mutationFn: () => startImpersonation(user.id),
    onSuccess: () => window.location.assign("/"),
    onError: (error) => {
      setIsConfirmOpen(false);
      showImpersonationError(error);
    },
  });

  const isStarting = startMutation.isPending || startMutation.isSuccess;

  return (
    <>
      <Button type="button" variant="outline" className="cursor-pointer" onClick={() => setIsConfirmOpen(true)}>
        <ImpersonateLabel />
      </Button>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!isStarting) setIsConfirmOpen(open);
        }}
        title={t("impersonation.confirm.title", { name: user.name })}
        description={t("impersonation.confirm.description")}
        confirmLabel={t("actions.signIn")}
        pending={isStarting}
        destructive={false}
        onConfirm={() => startMutation.mutate()}
      />
    </>
  );
}

export function ImpersonateButton({ user, unavailableReason }: { user: ImpersonationTarget; unavailableReason?: string }) {
  if (unavailableReason) return <UnavailableImpersonateButton reason={unavailableReason} />;

  return <AvailableImpersonateButton user={user} />;
}
