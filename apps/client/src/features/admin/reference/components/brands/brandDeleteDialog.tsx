import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { deleteBrand } from "../../api/brands";
import { invalidateBrands } from "../../api/queryKeys";
import type { Brand } from "../../types";
import type { DeleteBlocker } from "../shared/deleteRefusedDialog";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";
import type { BrandUsage } from "./useBrandListRows";

type BrandDeleteDialogProps = {
  brand: Brand;
  operators?: BrandUsage;
  owners?: BrandUsage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function countKnownUses(usage: BrandUsage | undefined): number {
  return usage?.state === "ready" ? usage.value.length : 0;
}

function listUsageBlockers(t: TFunction, language: string, operatorCount: number, ownerCount: number): DeleteBlocker[] {
  const blockers: DeleteBlocker[] = [];
  if (operatorCount > 0) blockers.push({ label: t("nav:items.operators"), value: operatorCount.toLocaleString(language) });
  if (ownerCount > 0) blockers.push({ label: t("nav:items.structureOwners"), value: ownerCount.toLocaleString(language) });
  return blockers;
}

export function BrandDeleteDialog({ brand, operators, owners, open, onOpenChange }: BrandDeleteDialogProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <RecordDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("reference.brands.deleteConfirm.title")}
      description={t("reference.brands.deleteConfirm.description", { name: brand.name })}
      confirmLabel={t("reference.brands.delete")}
      deletedMessage={t("reference.brands.toasts.deleted")}
      refusedTitle={t("reference.brands.deleteRefused.title")}
      deleteFailedKey="admin:reference.brands.errors.deleteFailed"
      blockers={listUsageBlockers(t, i18n.language, countKnownUses(operators), countKnownUses(owners))}
      deleteRecord={() => deleteBrand(brand.id)}
      onDeleted={invalidateBrands}
    />
  );
}
