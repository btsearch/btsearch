import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { invalidateRegions } from "../../api/queryKeys";
import { deleteRegion } from "../../api/regions";
import { regionLocationCountQueryOptions } from "../../api/usage";
import type { Region } from "../../types";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";

type RegionDeleteDialogProps = {
  region: Region;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RegionDeleteDialog({ region, open, onOpenChange }: RegionDeleteDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const { data: locationCount } = useQuery({ ...regionLocationCountQueryOptions(region.id), enabled: false });

  return (
    <RecordDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("reference.country.regions.remove.title")}
      description={t("reference.country.regions.remove.description", { name: region.name })}
      confirmLabel={t("reference.country.regions.remove.confirm")}
      deletedMessage={t("reference.country.regions.remove.success")}
      refusedTitle={t("reference.country.regions.remove.refusedTitle")}
      deleteFailedKey="admin:reference.country.regions.remove.failed"
      blockers={
        locationCount !== undefined && locationCount > 0
          ? [{ label: t("reference.country.regions.columns.locations"), value: locationCount.toLocaleString(i18n.language) }]
          : []
      }
      deleteRecord={() => deleteRegion(region.id)}
      onDeleted={invalidateRegions}
    />
  );
}
