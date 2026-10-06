import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateTeam } from "../../api/queryKeys";
import { showReferenceError } from "../../utils/errors";
import { ConfirmDialog } from "../shared/referenceCards";
import type { TeamEntry } from "./teamMember";
import { invalidateUserAdminQueries } from "@/features/admin/users/api/queryKeys";
import { deleteRoleGrant } from "@/features/admin/users/api/roleGrants";
import { getGrantRoleLabel } from "@/features/admin/users/utils/grants";
import { isNotFound } from "@/lib/api";
import { getCountryName } from "@/lib/geo/countryName";

type TeamRemoveDialogProps = {
  entry: TeamEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TeamRemoveDialog({ entry, open, onOpenChange }: TeamRemoveDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const { grant, member } = entry;

  const removeMutation = useMutation({
    mutationFn: () => deleteRoleGrant(grant.id),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateTeam(queryClient);
      void invalidateUserAdminQueries(queryClient, grant.userId);
      toast.success(t("users.detail.grants.remove.success"));
    },
    onError: (error) => {
      showReferenceError(error, "admin:reference.country.team.remove.failed");
      if (!isNotFound(error)) return;
      onOpenChange(false);
      void invalidateTeam(queryClient);
    },
  });

  const isMaintainer = grant.role === "maintainer";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!removeMutation.isPending) onOpenChange(nextOpen);
      }}
      title={isMaintainer ? t("reference.country.team.remove.maintainerTitle") : t("reference.country.team.remove.editorTitle")}
      description={t("reference.country.team.remove.description", {
        name: member.name,
        country: getCountryName(grant.countryCode, i18n.language),
        role: getGrantRoleLabel(t, grant.role),
      })}
      confirmLabel={isMaintainer ? t("reference.country.team.remove.maintainerConfirm") : t("reference.country.team.remove.editorConfirm")}
      pending={removeMutation.isPending}
      onConfirm={() => removeMutation.mutate()}
    />
  );
}
