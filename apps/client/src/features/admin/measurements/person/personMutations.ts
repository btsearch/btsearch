import type { MeasurementContributor, MeasurementContributorUpdate, MeasurementDeviceUpdate } from "@openbts/shared/contract";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import { updateContributor, updateDevice } from "../api/contributors";
import { invalidateContributorQueries, measurementsAdminKeys } from "../api/keys";
import { showApiError } from "@/lib/api";

type DeviceChange = { deviceId: string; change: MeasurementDeviceUpdate };

export function storeContributor(queryClient: QueryClient, contributor: MeasurementContributor): Promise<void> {
  queryClient.setQueryData(measurementsAdminKeys.contributor(contributor.user.id), contributor);
  return invalidateContributorQueries(queryClient, contributor.user.id);
}

export function useContributorUpdate(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: MeasurementContributorUpdate) => updateContributor(userId, change),
    onSuccess: (contributor) => storeContributor(queryClient, contributor),
    onError: showApiError,
  });
}

export function useDeviceUpdate(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deviceId, change }: DeviceChange) => updateDevice(deviceId, change),
    onSuccess: () => invalidateContributorQueries(queryClient, userId),
    onError: showApiError,
  });
}
