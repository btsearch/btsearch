import { useMutation, useQueryClient } from "@tanstack/react-query";

import { revertAuditOperation } from "./api";
import { invalidateAuditOperationQueries } from "./queries";
import { createConservativeStationImpact, invalidateStationUpdateQueriesBatch } from "@/features/admin/stations/queries";

export function useRevertOperationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revertAuditOperation,
    onSuccess: (result) => {
      const stationIds = [...new Set(result.affected_station_ids)];
      if (stationIds.length === 0) {
        invalidateAuditOperationQueries(queryClient);
        return;
      }
      invalidateStationUpdateQueriesBatch(queryClient, stationIds.map(createConservativeStationImpact), {
        conservative: true,
        refetchAdminDetail: true,
        invalidateAllStationHistories: true,
      });
    },
  });
}
