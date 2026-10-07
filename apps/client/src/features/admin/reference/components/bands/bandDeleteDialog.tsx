import { useTranslation } from "react-i18next";

import { deleteBand } from "../../api/bands";
import { invalidateBands } from "../../api/queryKeys";
import type { Band } from "../../types";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";

type BandDeleteDialogProps = {
  band: Band;
  cellCount: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BandDeleteDialog({ band, cellCount, open, onOpenChange }: BandDeleteDialogProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <RecordDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin:reference.bands.removal.title")}
      description={t("admin:reference.bands.removal.description", { name: band.name })}
      confirmLabel={t("admin:reference.bands.actions.delete")}
      deletedMessage={t("admin:reference.bands.removal.success")}
      refusedTitle={t("admin:reference.bands.removal.refusedTitle")}
      deleteFailedKey="admin:reference.bands.removal.failed"
      blockers={cellCount !== null && cellCount > 0 ? [{ label: t("common:labels.cells"), value: cellCount.toLocaleString(i18n.language) }] : []}
      deleteRecord={() => deleteBand(band.id)}
      onDeleted={invalidateBands}
      describeRefusal={(reason) => t("admin:reference.bands.removal.refusedDescription", { reason, name: band.name })}
    />
  );
}
