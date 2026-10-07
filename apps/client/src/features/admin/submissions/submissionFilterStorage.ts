import type { SubmissionListFilters, SubmissionStatusFilter, SubmissionTypeFilter } from "./types";
import { parseCountryCode } from "@/features/admin/reference/utils/countries";
import { parseUserId } from "@/features/admin/users/utils/userId";
import { isRecordId } from "@/lib/apiValues";
import { readStoredRecord } from "@/lib/storedRecord";

const STORAGE_KEY = "admin:submissions:filters:v2";
const SORT_ORDER_STORAGE_KEY = "admin:submissions:sort";

function readStatusFilter(value: unknown): SubmissionStatusFilter {
  return value === "all" || value === "pending" || value === "accepted" || value === "rejected" ? value : "pending";
}

function readTypeFilter(value: unknown): SubmissionTypeFilter {
  return value === "all" || value === "create" || value === "update" || value === "delete" ? value : "all";
}

function readIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecordId);
}

function readUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => parseUserId(entry) ?? []);
}

export function readCountryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const code = parseCountryCode(entry);
    if (code !== null) codes.add(code);
  }
  return [...codes].sort();
}

export function readStoredSubmissionFilters(): SubmissionListFilters {
  const stored = readStoredRecord(STORAGE_KEY);

  return {
    status: readStatusFilter(stored?.status),
    type: readTypeFilter(stored?.type),
    submitterIds: readUserIds(stored?.submitterIds),
    countryCodes: readCountryCodes(stored?.countryCodes),
    operatorIds: readIds(stored?.operatorIds),
    regionIds: readIds(stored?.regionIds),
  };
}

export function writeStoredSubmissionFilters(filters: SubmissionListFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    return;
  }
}

export function seedSubmissionFilters(submitterId: string): SubmissionListFilters {
  return { status: "all", type: "all", submitterIds: [submitterId], countryCodes: [], operatorIds: [], regionIds: [] };
}

export function readStoredSubmissionSortOrder(): "asc" | "desc" {
  try {
    return localStorage.getItem(SORT_ORDER_STORAGE_KEY) === "desc" ? "desc" : "asc";
  } catch {
    return "asc";
  }
}

export function writeStoredSubmissionSortOrder(sortOrder: "asc" | "desc"): void {
  try {
    localStorage.setItem(SORT_ORDER_STORAGE_KEY, sortOrder);
  } catch {
    return;
  }
}
