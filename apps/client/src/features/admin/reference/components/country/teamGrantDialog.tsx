import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateTeam } from "../../api/queryKeys";
import type { Country, GrantRole, TeamGrant } from "../../types";
import { showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { DialogNote } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { TeamPersonPicker } from "./teamPersonPicker";
import { TeamScopeFields, type TeamScopeKind } from "./teamScopeFields";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldTitle } from "@/components/ui/field";
import { invalidateUserAdminQueries } from "@/features/admin/users/api/queryKeys";
import { createRoleGrant } from "@/features/admin/users/api/roleGrants";
import type { PickerUser } from "@/features/admin/users/picker/api";
import type { RoleGrantCreate } from "@/features/admin/users/types";
import { getCountryName } from "@/lib/geo/countryName";

type TeamGrantDialogProps = {
  country: Country;
  role: GrantRole;
  grants: readonly TeamGrant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TeamGrantFormProps = {
  country: Country;
  role: GrantRole;
  grants: readonly TeamGrant[];
  isPending: boolean;
  onSubmit: (grant: RoleGrantCreate) => void;
  onCancel: () => void;
};

function TeamGrantForm({ country, role, grants, isPending, onSubmit, onCancel }: TeamGrantFormProps) {
  const { t, i18n } = useTranslation("admin");
  const personTitleId = useId();
  const [person, setPerson] = useState<PickerUser | null>(null);
  const [scope, setScope] = useState<TeamScopeKind>("country");
  const [regionIds, setRegionIds] = useState<number[]>([]);

  const isMaintainer = role === "maintainer";
  const heldUserIds = new Set(grants.filter((grant) => grant.role === role).map((grant) => grant.userId));
  const grantRegionIds = isMaintainer || scope === "country" ? null : regionIds;
  const canSubmit = person !== null && (grantRegionIds === null || grantRegionIds.length > 0) && !isPending;
  const countryName = getCountryName(country.code, i18n.language);
  const title = isMaintainer ? t("reference.country.team.maintainers.add") : t("reference.country.team.editors.add");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (person === null || !canSubmit) return;
    onSubmit({ userId: person.id, role, countryCode: country.code, regionIds: grantRegionIds });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {isMaintainer
            ? t("reference.country.team.dialog.maintainerDescription", { country: countryName })
            : t("reference.country.team.dialog.editorDescription", { country: countryName })}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldTitle id={personTitleId}>{t("reference.country.team.dialog.person")}</FieldTitle>
        <TeamPersonPicker person={person} onPersonChange={setPerson} heldUserIds={heldUserIds} labelledBy={personTitleId} />
      </Field>
      {isMaintainer ? (
        <DialogNote>{t("users.detail.grants.dialog.maintainerScopeHint")}</DialogNote>
      ) : (
        <TeamScopeFields countryCode={country.code} scope={scope} regionIds={regionIds} onScopeChange={setScope} onRegionIdsChange={setRegionIds} />
      )}
      <DialogFormFooter submitLabel={title} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function TeamGrantDialog({ country, role, grants, open, onOpenChange }: TeamGrantDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);
  const [shownGrants, setShownGrants] = useState(grants);
  if (open && shownGrants !== grants) setShownGrants(grants);

  const createMutation = useMutation({
    mutationFn: (grant: RoleGrantCreate) => createRoleGrant(grant),
    onSuccess: (_createdGrant, grant) => {
      onOpenChange(false);
      void invalidateTeam(queryClient);
      void invalidateUserAdminQueries(queryClient, grant.userId);
      toast.success(t("users.detail.grants.dialog.addSuccess"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.country.team.dialog.addFailed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <TeamGrantForm
          key={openingCount}
          country={country}
          role={role}
          grants={shownGrants}
          isPending={createMutation.isPending}
          onSubmit={(grant) => createMutation.mutate(grant)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
