import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementContributor, MeasurementContributorUpdate } from "@openbts/shared/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DESTRUCTIVE_GHOST_CLASS } from "../components/classNames";
import { formatWeight } from "../utils/format";
import { useContributorUpdate } from "./personMutations";
import { GrantedLine, TrustCardHeader } from "./trustCardParts";
import { getUntilSentence } from "./trustInputs";
import { VouchDialog } from "./vouchDialog";
import { Button } from "@/components/ui/button";
import { TINTED_BUTTON_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard, SettingsMeta, SettingsMetaItem } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type VouchCardDialog = "edit" | "withdraw" | null;

function VouchDetails({ vouch }: { vouch: NonNullable<MeasurementContributor["vouch"]> }) {
  const { t, i18n } = useTranslation(["admin", "settings"]);

  return (
    <>
      <SettingsMeta>
        <SettingsMetaItem>
          <span className="font-medium text-foreground">
            {t("measurements.person.weightValue", { weight: formatWeight(vouch.weight, i18n.language) })}
          </span>
        </SettingsMetaItem>
        <SettingsMetaItem>
          {vouch.confirmsAlone ? t("measurements.person.confirmsAlone") : t("measurements.person.vouch.needsSecond")}
        </SettingsMetaItem>
        <SettingsMetaItem>{getUntilSentence(t, i18n.language, vouch.endsAt)}</SettingsMetaItem>
      </SettingsMeta>
      <span className="block wrap-anywhere">{t("settings:measurements.reason", { reason: vouch.reason })}</span>
      <GrantedLine i18nKey="admin:users.detail.grants.grantedBy" by={vouch.by} at={vouch.at} />
    </>
  );
}

export function VouchCard({ contributor }: { contributor: MeasurementContributor }) {
  const { t, i18n } = useTranslation("admin");
  const [dialog, setDialog] = useState<VouchCardDialog>(null);
  const vouchMutation = useContributorUpdate(contributor.user.id);
  const { vouch } = contributor;

  function closeDialog(open: boolean) {
    if (!open && !vouchMutation.isPending) setDialog(null);
  }

  function saveVouch(change: MeasurementContributorUpdate) {
    vouchMutation.mutate(change, {
      onSuccess: () => {
        setDialog(null);
        toast.success(t("measurements.person.vouch.saved"));
      },
    });
  }

  function withdrawVouch() {
    vouchMutation.mutate(
      { vouch: null },
      {
        onSuccess: () => {
          setDialog(null);
          toast.success(t("measurements.person.vouch.withdrawn"));
        },
      },
    );
  }

  return (
    <SettingsCard className="flex-1">
      <TrustCardHeader
        icon={UserCheck01Icon}
        tone={vouch === null ? "default" : "primary"}
        title={t("measurements.person.vouch.title")}
        description={vouch === null ? t("measurements.person.vouch.description") : <VouchDetails vouch={vouch} />}
        action={
          vouch === null ? (
            <Button type="button" variant="ghost" size="sm" className={cn("cursor-pointer", TINTED_BUTTON_CLASS)} onClick={() => setDialog("edit")}>
              <HugeiconsIcon icon={UserCheck01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("measurements.person.vouch.action")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => setDialog("edit")}>
                {t("measurements.person.change")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className={DESTRUCTIVE_GHOST_CLASS} onClick={() => setDialog("withdraw")}>
                {t("measurements.person.vouch.withdraw")}
              </Button>
            </>
          )
        }
      />
      <VouchDialog
        contributor={contributor}
        open={dialog === "edit"}
        isPending={vouchMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={saveVouch}
      />
      <ConfirmDialog
        open={dialog === "withdraw"}
        onOpenChange={closeDialog}
        title={t("measurements.person.vouch.withdrawTitle")}
        description={t("measurements.person.vouch.withdrawDescription", { weight: formatWeight(contributor.weight.computed, i18n.language) })}
        confirmLabel={t("measurements.person.vouch.withdraw")}
        onConfirm={withdrawVouch}
        pending={vouchMutation.isPending}
      />
    </SettingsCard>
  );
}
