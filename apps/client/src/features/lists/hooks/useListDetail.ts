import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { UserListDetail } from "../api";
import { fetchListByUuid } from "../api";

export function useListDetail(uuid: string): UseQueryResult<UserListDetail> {
  return useQuery({
    queryKey: ["list", uuid],
    queryFn: () => fetchListByUuid(uuid),
    enabled: !!uuid,
  });
}
