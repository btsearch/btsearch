import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateSiteSettings } from "@/features/admin/settings/api";
import { showSettingsError } from "@/features/admin/settings/utils/errors";
import { settingsQueryOptions } from "@/hooks/useSettings";
import { ApiResponseError, CONFLICT_STATUS } from "@/lib/api";

function isNoEstimateDetail(detail: unknown): boolean {
  return typeof detail === "object" && detail !== null && "kind" in detail && detail.kind === "noEstimate";
}

export function isNoEstimateRefusal(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    error.status === CONFLICT_STATUS &&
    error.errors.some(({ details }) => (details ?? []).some(isNoEstimateDetail))
  );
}

export function usePublishVersion() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (version: number) => updateSiteSettings({ measurements: { publishedAlgorithmVersion: version } }),
    onSuccess: (settings, version) => {
      queryClient.setQueryData(settingsQueryOptions().queryKey, settings);
      toast.success(t("measurements.evaluation.publish.done", { version }));
    },
    onError: (error) => {
      if (!isNoEstimateRefusal(error)) showSettingsError(error);
    },
  });
}
