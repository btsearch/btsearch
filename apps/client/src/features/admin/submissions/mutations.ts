import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import type { CellDraftBase } from "@/features/admin/cells/cellEditRow";
import { submissionDetailQueryOptions } from "@/features/submissions/queries";
import type { LocationPayload, SectorPayload, StationPayload } from "@/features/submissions/types";
import { sectorAssignmentPayload } from "@/features/submissions/utils/cells";
import { API_BASE, fetchJson } from "@/lib/api";

type LocalCell = CellDraftBase & {
  _serverId?: number;
  operation: "add" | "update" | "delete" | "unchanged";
  target_cell_id: number | null;
};

export interface SaveSubmissionPayload {
  submissionId: string;
  reviewNotes: string;
  station: StationPayload;
  location: LocationPayload;
  sectors: SectorPayload[];
  localCells: LocalCell[];
}

function invalidateSubmissionQueries(queryClient: QueryClient, submissionId: string): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "submission", submissionId] }),
    queryClient.invalidateQueries({ queryKey: ["submission-edit", submissionId] }),
    queryClient.invalidateQueries({ queryKey: submissionDetailQueryOptions(submissionId).queryKey }),
  ]);
}

export function useSaveSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveSubmissionPayload) => {
      return fetchJson(`${API_BASE}/submissions/${payload.submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_notes: payload.reviewNotes || null,
          station: payload.station,
          location: payload.location,
          sectors: payload.sectors,
          cells: payload.localCells
            .filter((lc) => lc.operation !== "unchanged")
            .map((lc) => ({
              operation: lc.operation,
              target_cell_id: lc.target_cell_id,
              ...sectorAssignmentPayload(lc._sectorLocalId),
              band_id: lc.band_id,
              rat: lc.rat,
              type: lc.type ?? null,
              is_confirmed: lc.is_confirmed,
              notes: lc.notes || null,
              details: lc.operation === "delete" ? undefined : Object.keys(lc.details).length > 0 ? lc.details : undefined,
            })),
        }),
      });
    },
    onSuccess: (_data, payload) => {
      invalidateSubmissionQueries(queryClient, payload.submissionId);
    },
  });
}

export function useApproveSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, reviewNotes }: { submissionId: string; reviewNotes: string }) => {
      return fetchJson(`${API_BASE}/submissions/${submissionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_notes: reviewNotes || null }),
      });
    },
    onSuccess: (_data, payload) => {
      invalidateSubmissionQueries(queryClient, payload.submissionId);
    },
  });
}

export function useRejectSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, reviewNotes }: { submissionId: string; reviewNotes: string }) => {
      return fetchJson(`${API_BASE}/submissions/${submissionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_notes: reviewNotes || null }),
      });
    },
    onSuccess: (_data, payload) => {
      invalidateSubmissionQueries(queryClient, payload.submissionId);
    },
  });
}
