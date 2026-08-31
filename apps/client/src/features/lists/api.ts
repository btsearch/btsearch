import { API_BASE, fetchJson } from "@/lib/api";

export type UserListSummary = {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  notificationsEnabled: boolean;
  stations: { internal: number[]; uke: number[] };
  radiolines: number[];
  stationCount: number;
  radiolineCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { uuid: string; name?: string; username?: string | null; image?: string | null };
};

export type UserListDetail = {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  notificationsEnabled: boolean;
  stations: { internal: number[]; uke: number[] };
  radiolines: number[];
  createdAt: string;
  updatedAt: string;
};

type ListsResponse = { data: UserListSummary[]; totalCount: number };
type ListDetailResponse = { data: UserListDetail };
type CreateListBody = {
  name: string;
  description?: string;
  is_public?: boolean;
  stations: { internal: number[]; uke: number[] };
  radiolines?: number[];
};
type UpdateListBody = Partial<{
  name: string;
  description: string;
  is_public: boolean;
  notificationsEnabled: boolean;
  stations: { internal: number[]; uke: number[] };
  radiolines: number[];
}>;

export async function fetchUserLists(limit = 50, page = 1, search?: string, all?: boolean): Promise<ListsResponse> {
  const params = new URLSearchParams({ limit: String(limit), page: String(page) });
  if (search) params.set("search", search);
  if (all) params.set("all", "true");
  return fetchJson<ListsResponse>(`${API_BASE}/lists?${params.toString()}`);
}

export async function fetchListByUuid(uuid: string): Promise<UserListDetail> {
  const res = await fetchJson<ListDetailResponse>(`${API_BASE}/lists/${uuid}`);
  return res.data;
}

export async function createList(data: CreateListBody): Promise<UserListSummary> {
  const res = await fetchJson<{ data: UserListSummary }>(`${API_BASE}/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateList(uuid: string, data: UpdateListBody): Promise<UserListSummary> {
  const res = await fetchJson<{ data: UserListSummary }>(`${API_BASE}/lists/${uuid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteList(uuid: string): Promise<void> {
  await fetchJson(`${API_BASE}/lists/${uuid}`, { method: "DELETE" });
}
