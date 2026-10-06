import { useQuery } from "@tanstack/react-query";

import { countryRegionsQueryOptions } from "../../api/reference";
import { roleGrantsQueryOptions } from "../../api/roleGrants";
import { userListQueryOptions } from "../../api/users";
import type { AdminListedUser, CountryRegion, RoleGrant } from "../../types";
import { type RegionNameIndex, getRegionScopedCountryCodes, groupGrantsByUser, indexRegionNames } from "../../utils/grants";
import { type UserListCriteria, toUserListParams } from "./userListCriteria";
import { useSettledSession } from "@/hooks/useSettledSession";

export type UserListGrantChips = { state: "loading" } | { state: "ready"; grants: readonly RoleGrant[]; regionNames: RegionNameIndex };

export type UserListRow = {
  user: AdminListedUser;
  isViewer: boolean;
  grantChips: UserListGrantChips | null;
};

const NO_USERS: AdminListedUser[] = [];
const NO_GRANTS: RoleGrant[] = [];
const NO_REGIONS: CountryRegion[] = [];
const LOADING_GRANT_CHIPS: UserListGrantChips = { state: "loading" };

function listEditorIds(users: readonly AdminListedUser[]): string[] {
  return users.filter((user) => user.account.role === "editor").map((user) => user.id);
}

export function useUserListRows(criteria: UserListCriteria, pageSize: number, isPageSizeMeasured: boolean) {
  const { data: session } = useSettledSession();
  const listQuery = useQuery({ ...userListQueryOptions(toUserListParams(criteria, pageSize)), enabled: isPageSizeMeasured });
  const users = listQuery.data?.users ?? NO_USERS;
  const grantsQuery = useQuery(roleGrantsQueryOptions(listEditorIds(users)));
  const grants = grantsQuery.data;
  const regionsQuery = useQuery(countryRegionsQueryOptions(getRegionScopedCountryCodes(grants ?? NO_GRANTS)));
  const regions = regionsQuery.data;

  const viewerId = session?.user.id;
  const areGrantChipsReady = grants !== undefined && (regions !== undefined || grants.every((grant) => grant.regionIds === null));
  const haveGrantChipsFailed = !areGrantChipsReady && (grantsQuery.isError || regionsQuery.isError);
  const grantsByUser = groupGrantsByUser(grants ?? NO_GRANTS);
  const regionNames = indexRegionNames(regions ?? NO_REGIONS);

  function getGrantChips(user: AdminListedUser): UserListGrantChips | null {
    if (user.account.role !== "editor" || haveGrantChipsFailed) return null;
    if (!areGrantChipsReady) return LOADING_GRANT_CHIPS;
    return { state: "ready", grants: grantsByUser.get(user.id) ?? NO_GRANTS, regionNames };
  }

  function retryGrantChips() {
    if (grantsQuery.isError) void grantsQuery.refetch();
    if (regionsQuery.isError) void regionsQuery.refetch();
  }

  const rows = users.map((user): UserListRow => ({ user, isViewer: user.id === viewerId, grantChips: getGrantChips(user) }));

  return {
    rows,
    total: listQuery.data?.total ?? 0,
    hasRequestedPage: listQuery.data !== undefined && !listQuery.isPlaceholderData,
    isPlaceholderData: listQuery.isPlaceholderData,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
    haveGrantChipsFailed,
    isRetryingGrantChips: grantsQuery.isFetching || regionsQuery.isFetching,
    retryGrantChips,
  };
}
