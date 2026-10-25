import type { MeasurementUpload } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";

import { uploadPageQueryOptions } from "../api/uploads";
import type { UploadsCriteria } from "./uploadsSearch";

const NO_UPLOADS: MeasurementUpload[] = [];

export function useUploadRows(criteria: UploadsCriteria, pageSize: number, cursor: string | null, isPageSizeMeasured: boolean) {
  const uploadsQuery = useQuery({
    ...uploadPageQueryOptions({ statuses: criteria.statuses, userId: criteria.userId, limit: pageSize, cursor }),
    enabled: isPageSizeMeasured,
  });
  const page = uploadsQuery.data;

  return {
    uploads: page?.data ?? NO_UPLOADS,
    total: page?.paging.total ?? 0,
    nextCursor: page?.paging.nextCursor ?? null,
    hasRequestedPage: page !== undefined && !uploadsQuery.isPlaceholderData,
    isPlaceholderData: uploadsQuery.isPlaceholderData,
    isLoading: page === undefined && !uploadsQuery.isError,
    isFetching: uploadsQuery.isFetching,
    isError: uploadsQuery.isError,
    refetch: () => void uploadsQuery.refetch(),
  };
}
