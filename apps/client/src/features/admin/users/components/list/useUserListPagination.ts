import { useState } from "react";

import { USER_LIST_MAX_LIMIT } from "../../constants";
import { useFittedListPagination } from "@/hooks/useFittedListPagination";
import { useIsMobile } from "@/hooks/useMobile";

const MOBILE_ROW_HEIGHT_FALLBACK = 109;

export function useUserListPagination(page: number, onPageChange: (page: number) => void) {
  const isMobile = useIsMobile();
  const [chosenTablePageSize, setChosenTablePageSize] = useState<number | null>(null);

  return useFittedListPagination({
    page,
    chosenPageSize: isMobile ? null : chosenTablePageSize,
    maxPageSize: USER_LIST_MAX_LIMIT,
    mobileRowHeightFallback: MOBILE_ROW_HEIGHT_FALLBACK,
    onPagingChange: (paging) => {
      if (!isMobile) setChosenTablePageSize(paging.pageSize);
      if (paging.page !== page) onPageChange(paging.page);
    },
  });
}
