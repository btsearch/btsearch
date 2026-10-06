import type { Me } from "@openbts/shared/contract";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useMemo } from "react";

import type { Allowance } from "../model/selection";
import { meQueryOptions } from "@/lib/auth/me";

const SIGNED_OUT_USER_ID = "";
const ALWAYS_STALE = 0;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const SHORTEST_WAIT_MINUTES = 1;
const UNKNOWN_ALLOWANCE: Allowance = { status: "unknown" };
const EXEMPT_ALLOWANCE: Allowance = { status: "exempt" };

function toAllowance(me: Me | undefined): Allowance {
  const limits: Partial<Me["limits"]> | undefined = me?.limits;
  const analyzerChanges = limits?.analyzerChanges;
  if (analyzerChanges === undefined) return UNKNOWN_ALLOWANCE;
  if (analyzerChanges === null) return EXEMPT_ALLOWANCE;
  return { status: "limited", limit: analyzerChanges.limit, remaining: analyzerChanges.remaining, resetsAt: analyzerChanges.resetsAt };
}

export function useAnalyzerAllowance(userId: string | undefined): Allowance {
  const { data } = useQuery({ ...meQueryOptions(userId ?? SIGNED_OUT_USER_ID), enabled: userId !== undefined, staleTime: ALWAYS_STALE });
  return useMemo(() => toAllowance(data), [data]);
}

export async function refreshAnalyzerAllowance(queryClient: QueryClient, userId: string): Promise<Allowance> {
  const options = meQueryOptions(userId);

  try {
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    return toAllowance(await queryClient.fetchQuery({ ...options, staleTime: ALWAYS_STALE }));
  } catch {
    return UNKNOWN_ALLOWANCE;
  }
}

export function formatAllowanceWait(waitMs: number, t: TFunction): string {
  const minutes = Math.max(SHORTEST_WAIT_MINUTES, Math.ceil(waitMs / MS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) return t("cellAnalyzer:batch.waitMinutes", { value: minutes });
  return t("cellAnalyzer:batch.waitHours", { value: Math.ceil(minutes / MINUTES_PER_HOUR) });
}
