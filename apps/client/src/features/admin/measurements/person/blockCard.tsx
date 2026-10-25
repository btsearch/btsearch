import { UserBlock01Icon } from "@hugeicons/core-free-icons";
import type { MeasurementContributor } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateContributor } from "../api/contributors";
import { invalidateContributorQueries } from "../api/keys";
import { excludeContributorUploads } from "../api/uploads";
import { BlockDialog, type BlockRequest } from "./blockDialog";
import { storeContributor, useContributorUpdate } from "./personMutations";
import { GrantedLine, TrustCardHeader } from "./trustCardParts";
import { getUntilSentence } from "./trustInputs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard, SettingsMeta, SettingsMetaItem } from "@/features/settings/components/settingsPrimitives";
import { createAuditOperationHandle, showApiError } from "@/lib/api";

type BlockCardDialog = "edit" | "unblock" | null;

function BlockDetails({ block }: { block: NonNullable<MeasurementContributor["block"]> }) {
  const { t, i18n } = useTranslation(["admin", "settings"]);

  return (
    <>
      <SettingsMeta>
        <SettingsMetaItem>{getUntilSentence(t, i18n.language, block.endsAt)}</SettingsMetaItem>
        <SettingsMetaItem>{t("settings:measurements.reason", { reason: block.reason })}</SettingsMetaItem>
      </SettingsMeta>
      <GrantedLine i18nKey="admin:measurements.person.block.blockedBy" by={block.by} at={block.at} />
    </>
  );
}

export function BlockCard({ contributor }: { contributor: MeasurementContributor }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<BlockCardDialog>(null);
  const userId = contributor.user.id;
  const { block } = contributor;

  const blockMutation = useMutation({
    mutationFn: async ({ reason, endsAt, isExcludingUploads }: BlockRequest) => {
      const auditOperation = createAuditOperationHandle();
      const blocked = await updateContributor(userId, { block: { reason, endsAt: endsAt ?? undefined } }, auditOperation);
      const excludedCount = isExcludingUploads ? await excludeContributorUploads(userId, reason, auditOperation) : null;
      return { blocked, excludedCount };
    },
    onSuccess: ({ blocked }) => storeContributor(queryClient, blocked),
    onError: (error) => {
      showApiError(error);
      void invalidateContributorQueries(queryClient, userId);
    },
  });
  const unblockMutation = useContributorUpdate(userId);
  const isPending = blockMutation.isPending || unblockMutation.isPending;

  function closeDialog(open: boolean) {
    if (!open && !isPending) setDialog(null);
  }

  function saveBlock(request: BlockRequest) {
    blockMutation.mutate(request, {
      onSuccess: ({ excludedCount }) => {
        setDialog(null);
        const message = block === null ? t("measurements.person.block.blockedTitle") : t("measurements.person.block.changed");
        const description = excludedCount === null ? undefined : t("measurements.person.excludeAll.success", { count: excludedCount });
        toast.success(message, { description });
      },
    });
  }

  function unblock() {
    unblockMutation.mutate(
      { block: null },
      {
        onSuccess: () => {
          setDialog(null);
          toast.success(t("measurements.person.block.unblocked"));
        },
      },
    );
  }

  return (
    <SettingsCard className="flex-1">
      <TrustCardHeader
        icon={UserBlock01Icon}
        tone={block === null ? "default" : "destructive"}
        title={block === null ? t("measurements.person.block.title") : t("measurements.person.block.blockedTitle")}
        description={block === null ? t("measurements.person.block.description") : <BlockDetails block={block} />}
        action={
          block === null ? (
            <Button type="button" variant="destructive" size="sm" className="cursor-pointer" onClick={() => setDialog("edit")}>
              {t("measurements.block")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => setDialog("edit")}>
                {t("measurements.person.change")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => setDialog("unblock")}>
                {t("measurements.unblock")}
              </Button>
            </>
          )
        }
      />
      <BlockDialog
        contributor={contributor}
        open={dialog === "edit"}
        isPending={blockMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={saveBlock}
      />
      <ConfirmDialog
        open={dialog === "unblock"}
        onOpenChange={closeDialog}
        title={t("measurements.person.block.unblockTitle")}
        description={t("measurements.person.block.unblockDescription")}
        confirmLabel={t("measurements.unblock")}
        onConfirm={unblock}
        pending={unblockMutation.isPending}
        destructive={false}
      />
    </SettingsCard>
  );
}
