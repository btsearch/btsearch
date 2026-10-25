import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MEASUREMENT_UPLOAD_STATUSES, type MeasurementUploadStatus } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { contributorQueryOptions } from "../api/contributors";
import { useContributorName } from "../components/contributorIdentity";
import { shortId } from "../utils/format";
import { type UploadsCriteria, countActiveUploadFilters } from "./uploadsSearch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FacetToggles, PRESSED_TOGGLE_CLASS } from "@/features/admin/reference/components/shared/facetToggles";
import { getUploadStatusLabel } from "@/features/settings/components/measurements/uploadStatus";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

type UploadsToolbarProps = {
  criteria: UploadsCriteria;
  onStatusesChange: (statuses: MeasurementUploadStatus[]) => void;
  onPersonClear: () => void;
  onClearFilters: () => void;
};

function PersonToggle({ userId, onClear }: { userId: string; onClear: () => void }) {
  const { t } = useTranslation("admin");
  const contributorQuery = useQuery(contributorQueryOptions(userId));
  const contributorName = useContributorName(contributorQuery.data?.user ?? null);
  const name = contributorQuery.isError ? shortId(userId) : contributorName;

  return (
    <Button type="button" variant="ghost" aria-pressed className={cn("cursor-pointer", PRESSED_TOGGLE_CLASS)} onClick={onClear}>
      {contributorQuery.isPending ? <Skeleton aria-hidden="true" className="h-4 w-36" /> : t("measurements.uploads.person", { name })}
      <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

export function UploadsToolbar({ criteria, onStatusesChange, onPersonClear, onClearFilters }: UploadsToolbarProps) {
  const { t } = useTranslation(["admin", "settings", "common"]);
  const statusOptions = MEASUREMENT_UPLOAD_STATUSES.map((status) => ({ value: status, label: getUploadStatusLabel(t, status) }));
  const activeFilterCount = countActiveUploadFilters(criteria);

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-2">
      <FacetToggles label={t("common:labels.status")} options={statusOptions} selected={criteria.statuses} onChange={onStatusesChange} />
      {criteria.userId === null ? null : <PersonToggle userId={criteria.userId} onClear={onPersonClear} />}
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </div>
  );
}
