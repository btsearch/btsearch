import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";

export const BLOCK_LIST_ROW_CLASS = "flex min-h-11 items-center gap-3 border-t py-1.5 pr-2 pl-4 first:border-t-0";

const SKELETON_ROWS = [0, 1, 2];

export function BlockListLoading() {
  const { t } = useTranslation("common");

  return (
    <div role="status" aria-label={t("actions.loading")}>
      {SKELETON_ROWS.map((row) => (
        <div key={row} aria-hidden="true" className={BLOCK_LIST_ROW_CLASS}>
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}
