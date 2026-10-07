import { useTranslation } from "react-i18next";

import { invalidateStructureOwners } from "../../api/queryKeys";
import { deleteStructureOwner } from "../../api/structureOwners";
import type { StructureOwner } from "../../types";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";
import type { OwnerLocationCount } from "./useStructureOwnerListRows";

type StructureOwnerDeleteDialogProps = {
  owner: StructureOwner;
  locations?: OwnerLocationCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StructureOwnerDeleteDialog({ owner, locations, open, onOpenChange }: StructureOwnerDeleteDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const locationCount = locations?.state === "ready" ? locations.value : 0;

  return (
    <RecordDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("reference.owners.deleteConfirm.title")}
      description={t("reference.owners.deleteConfirm.description", { name: owner.name })}
      confirmLabel={t("reference.owners.deleteConfirm.confirm")}
      deletedMessage={t("reference.owners.toasts.deleted")}
      refusedTitle={t("reference.owners.deleteRefused.title")}
      deleteFailedKey="admin:reference.owners.errors.deleteFailed"
      blockers={locationCount > 0 ? [{ label: t("nav:items.locations"), value: locationCount.toLocaleString(i18n.language) }] : []}
      deleteRecord={() => deleteStructureOwner(owner.id)}
      onDeleted={invalidateStructureOwners}
    />
  );
}
