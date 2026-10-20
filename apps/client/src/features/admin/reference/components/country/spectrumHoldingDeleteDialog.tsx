import { useTranslation } from "react-i18next";

import { invalidateSpectrumHoldings } from "../../api/queryKeys";
import { deleteSpectrumHolding } from "../../api/spectrumHoldings";
import type { SpectrumHolding } from "../../types";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";
import { formatRange } from "@/features/spectrum/format";

type SpectrumHoldingDeleteDialogProps = {
  holding: SpectrumHolding;
  operatorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SpectrumHoldingDeleteDialog({ holding, operatorName, open, onOpenChange }: SpectrumHoldingDeleteDialogProps) {
  const { t } = useTranslation("admin");

  return (
    <RecordDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("reference.country.spectrum.remove.title")}
      description={t("reference.country.spectrum.remove.description", {
        name: operatorName,
        range: formatRange(t, holding.downlinkKhz),
      })}
      confirmLabel={t("reference.country.spectrum.remove.confirm")}
      deletedMessage={t("reference.country.spectrum.remove.success")}
      refusedTitle={t("reference.country.spectrum.remove.refusedTitle")}
      deleteFailedKey="admin:reference.country.spectrum.remove.failed"
      deleteRecord={() => deleteSpectrumHolding(holding.id)}
      onDeleted={invalidateSpectrumHoldings}
    />
  );
}
