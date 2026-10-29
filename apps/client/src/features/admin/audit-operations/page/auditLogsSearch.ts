import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS, type AuditEntity, type AuditOperationKind } from "@openbts/shared/audit";
import { type AuditOperationSort, MAX_ID } from "@openbts/shared/contract";

import { AUDIT_SEARCH_MAX_LENGTH } from "../api";
import type { AuditOperationQuery } from "../types";
import { parseCountryCode } from "@/features/admin/reference/utils/countries";
import { listSearchUserIds } from "@/features/admin/users/utils/userId";
import { getLastOffsetPage, joinSearchValues, listSearchValues, parseSearchQuery, parseSearchValues, parseSearchWholeNumber } from "@/lib/urlSearch";

type AuditLogsSearch = {
  q?: string;
  operation?: number;
  users?: string;
  countries?: string;
  tables?: string;
  kinds?: string;
  from?: string;
  to?: string;
  sort?: "createdAt";
  page?: number;
  size?: number;
};

export type AuditLogsCriteria = {
  query: string;
  entities: AuditEntity[];
  kinds: AuditOperationKind[];
  userIds: string[];
  countryCodes: string[];
  from: string;
  to: string;
  sort: AuditOperationSort;
  page: number;
  pageSize: number | null;
  operationId: number | null;
};

export type AuditLogsFilters = Pick<AuditLogsCriteria, "entities" | "kinds" | "userIds" | "countryCodes" | "from" | "to">;

export const AUDIT_LOGS_MAX_PAGE_SIZE = 200;

const MOST_USER_IDS = 100;
const DAY_PATTERN = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;

function parseOperationId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function listEntities(value: unknown): AuditEntity[] {
  const requested = new Set(listSearchValues(value));
  return AUDIT_ENTITIES.filter((entity) => requested.has(entity));
}

function listKinds(value: unknown): AuditOperationKind[] {
  const requested = new Set(listSearchValues(value));
  return AUDIT_OPERATION_KINDS.filter((kind) => requested.has(kind));
}

function listUserIds(value: unknown): string[] {
  return listSearchUserIds(value, MOST_USER_IDS);
}

function listCountryCodes(value: unknown): string[] {
  return parseSearchValues(value, (item) => parseCountryCode(item.trim()));
}

function parseDay(value: unknown): string | undefined {
  const match = typeof value === "string" ? DAY_PATTERN.exec(value) : null;
  if (match === null) return undefined;

  const [day, year, month, dayOfMonth] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth)));
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(dayOfMonth) ? day : undefined;
}

export function parseAuditLogsSearch(search: Record<string, unknown>): AuditLogsSearch {
  return {
    q: parseSearchQuery(search.q),
    operation: parseOperationId(search.operation),
    users: joinSearchValues(listUserIds(search.users)),
    countries: joinSearchValues(listCountryCodes(search.countries)),
    tables: joinSearchValues(listEntities(search.tables)),
    kinds: joinSearchValues(listKinds(search.kinds)),
    from: parseDay(search.from),
    to: parseDay(search.to),
    sort: search.sort === "createdAt" ? "createdAt" : undefined,
    page: parseSearchWholeNumber(search.page, 1, MAX_ID),
    size: parseSearchWholeNumber(search.size, 1, AUDIT_LOGS_MAX_PAGE_SIZE),
  };
}

export function readAuditLogsCriteria(search: AuditLogsSearch): AuditLogsCriteria {
  return {
    query: (search.q ?? "").slice(0, AUDIT_SEARCH_MAX_LENGTH).trim(),
    entities: listEntities(search.tables),
    kinds: listKinds(search.kinds),
    userIds: listUserIds(search.users),
    countryCodes: listCountryCodes(search.countries),
    from: search.from ?? "",
    to: search.to ?? "",
    sort: search.sort ?? "-createdAt",
    page: search.page ?? 0,
    pageSize: search.size ?? null,
    operationId: search.operation ?? null,
  };
}

export function toAuditLogsSearch(criteria: AuditLogsCriteria): AuditLogsSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    operation: criteria.operationId ?? undefined,
    users: joinSearchValues(listUserIds(criteria.userIds)),
    countries: joinSearchValues(listCountryCodes(criteria.countryCodes)),
    tables: joinSearchValues(listEntities(criteria.entities)),
    kinds: joinSearchValues(listKinds(criteria.kinds)),
    from: criteria.from === "" ? undefined : criteria.from,
    to: criteria.to === "" ? undefined : criteria.to,
    sort: criteria.sort === "createdAt" ? "createdAt" : undefined,
    page: criteria.page > 0 ? criteria.page : undefined,
    size: criteria.pageSize ?? undefined,
  };
}

export function getLastAuditLogsPage(total: number, pageSize: number): number {
  return getLastOffsetPage(total, pageSize, MAX_ID);
}

export function toAuditOperationsQuery(criteria: AuditLogsCriteria, pageSize: number): AuditOperationQuery {
  return {
    limit: pageSize,
    offset: Math.min(criteria.page * pageSize, MAX_ID),
    sort: criteria.sort,
    entities: criteria.entities,
    kinds: criteria.kinds,
    userIds: criteria.userIds,
    countryCodes: criteria.countryCodes,
    createdAfter: criteria.from === "" ? undefined : new Date(`${criteria.from}T00:00:00`).toISOString(),
    createdBefore: criteria.to === "" ? undefined : new Date(`${criteria.to}T23:59:59.999`).toISOString(),
    q: criteria.query === "" ? undefined : criteria.query,
    includeTotal: true,
  };
}
