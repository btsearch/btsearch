import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateTeam } from "../../api/queryKeys";
import { showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { DialogNote } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { TeamMemberAvatar, TeamMemberIdentity } from "./teamCardParts";
import type { TeamEntry } from "./teamMember";
import { TeamScopeFields, type TeamScopeKind } from "./teamScopeFields";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invalidateUserAdminQueries } from "@/features/admin/users/api/queryKeys";
import { updateRoleGrantRegions } from "@/features/admin/users/api/roleGrants";
import { GrantRoleBadge } from "@/features/admin/users/components/detail/grantRoleBadge";
import { isNotFound } from "@/lib/api";

type TeamScopeDialogProps = {
  entry: TeamEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TeamScopeFormProps = {
  entry: TeamEntry;
  isPending: boolean;
  onSubmit: (regionIds: number[] | null) => void;
  onCancel: () => void;
};

function hasSameRegionIds(left: readonly number[] | null, right: readonly number[] | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.length !== right.length) return false;

  const rightRegionIds = new Set(right);
  return left.every((regionId) => rightRegionIds.has(regionId));
}

function TeamScopeForm({ entry, isPending, onSubmit, onCancel }: TeamScopeFormProps) {
  const { t } = useTranslation("admin");
  const { grant, member } = entry;
  const [scope, setScope] = useState<TeamScopeKind>(grant.regionIds === null ? "country" : "regions");
  const [regionIds, setRegionIds] = useState<number[]>(grant.regionIds ?? []);

  const nextRegionIds = scope === "country" ? null : regionIds;
  const hasChanges = !hasSameRegionIds(grant.regionIds, nextRegionIds);
  const canSubmit = hasChanges && (nextRegionIds === null || nextRegionIds.length > 0) && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(nextRegionIds);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("users.detail.grants.changeScope")}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <TeamMemberAvatar member={member} />
        <TeamMemberIdentity member={member} isLinked={false} className="flex-1" />
        <GrantRoleBadge role={grant.role} />
      </div>
      <TeamScopeFields
        countryCode={grant.countryCode}
        scope={scope}
        regionIds={regionIds}
        onScopeChange={setScope}
        onRegionIdsChange={setRegionIds}
      />
      <DialogNote>{t("users.detail.grants.dialog.fixedNote")}</DialogNote>
      <DialogFormFooter submitLabel={t("common:actions.save")} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function TeamScopeDialog({ entry, open, onOpenChange }: TeamScopeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);
  const { grant } = entry;

  const updateMutation = useMutation({
    mutationFn: (regionIds: number[] | null) => updateRoleGrantRegions(grant.id, regionIds),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateTeam(queryClient);
      void invalidateUserAdminQueries(queryClient, grant.userId);
      toast.success(t("users.detail.grants.dialog.editSuccess"));
    },
    onError: (error) => {
      showReferenceError(error, "admin:reference.country.team.scope.saveFailed");
      if (!isNotFound(error)) return;
      onOpenChange(false);
      void invalidateTeam(queryClient);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!updateMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <TeamScopeForm
          key={openingCount}
          entry={entry}
          isPending={updateMutation.isPending}
          onSubmit={(regionIds) => updateMutation.mutate(regionIds)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
