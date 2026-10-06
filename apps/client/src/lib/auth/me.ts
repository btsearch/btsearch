import type { Me } from "@openbts/shared/contract";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchV2Data } from "@/lib/api";

const SIGNED_OUT_USER_ID = "";

export function meQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["me", userId] as const,
    queryFn: ({ signal }) => fetchV2Data<Me>("me", { signal }),
  });
}

export function useEditorMe(userId: string | undefined, isEditor: boolean) {
  return useQuery({ ...meQueryOptions(userId ?? SIGNED_OUT_USER_ID), enabled: isEditor });
}
