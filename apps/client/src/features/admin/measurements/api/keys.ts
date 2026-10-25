import type { MeasurementContributorListQuery, MeasurementUploadStatus } from "@openbts/shared/contract";
import type { QueryClient } from "@tanstack/react-query";

export type UploadPageParams = {
  statuses: readonly MeasurementUploadStatus[];
  userId: string | null;
  limit: number;
  cursor: string | null;
};

export type ContributorPageParams = {
  sort: MeasurementContributorListQuery["sort"];
  limit: number;
  cursor: string | null;
};

const MEASUREMENTS_ADMIN_ROOT = ["admin", "measurements"] as const;

export const measurementsAdminKeys = {
  engine: () => [...MEASUREMENTS_ADMIN_ROOT, "engine"] as const,
  uploads: () => [...MEASUREMENTS_ADMIN_ROOT, "uploads"] as const,
  uploadPage: (params: UploadPageParams) => [...MEASUREMENTS_ADMIN_ROOT, "uploads", "page", params] as const,
  contributors: () => [...MEASUREMENTS_ADMIN_ROOT, "contributors"] as const,
  contributorPage: (params: ContributorPageParams) => [...MEASUREMENTS_ADMIN_ROOT, "contributors", "page", params] as const,
  contributor: (userId: string) => [...MEASUREMENTS_ADMIN_ROOT, "contributors", "detail", userId] as const,
  devices: (userId: string) => [...MEASUREMENTS_ADMIN_ROOT, "devices", userId] as const,
  readingBlocks: () => [...MEASUREMENTS_ADMIN_ROOT, "reading-blocks"] as const,
  readerVersions: () => [...MEASUREMENTS_ADMIN_ROOT, "reader-versions"] as const,
  quirkRules: () => [...MEASUREMENTS_ADMIN_ROOT, "quirk-rules"] as const,
  readerQuirkFlags: () => [...MEASUREMENTS_ADMIN_ROOT, "reader-quirk-flags"] as const,
  socs: () => [...MEASUREMENTS_ADMIN_ROOT, "socs"] as const,
  deviceModelSearch: (query: string) => [...MEASUREMENTS_ADMIN_ROOT, "device-models", "search", query] as const,
  deviceModelsByIds: (ids: readonly number[]) => [...MEASUREMENTS_ADMIN_ROOT, "device-models", "ids", ids] as const,
  evaluations: () => [...MEASUREMENTS_ADMIN_ROOT, "evaluations"] as const,
  evaluation: (id: number) => [...MEASUREMENTS_ADMIN_ROOT, "evaluations", "detail", id] as const,
};

export async function invalidateContributorQueries(queryClient: QueryClient, userId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.contributors() }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.devices(userId) }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.uploads() }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.engine() }),
  ]);
}

export async function invalidateUploadQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.uploads() }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.engine() }),
  ]);
}

export async function invalidateReadingBlockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.readingBlocks() }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.quirkRules() }),
    queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.engine() }),
  ]);
}
