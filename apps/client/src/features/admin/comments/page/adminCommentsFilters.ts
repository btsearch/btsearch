import { useTranslation } from "react-i18next";

import { ADMIN_COMMENTS_QUEUES, type AdminCommentsQueue } from "./commentsSearch";

export type AdminCommentsQueueProps = {
  queue: AdminCommentsQueue;
  pendingCount: number | undefined;
  onQueueChange: (queue: AdminCommentsQueue) => void;
};

export type AdminCommentsFilterProps = AdminCommentsQueueProps & {
  searchText: string;
  authorIds: string[];
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onAuthorIdsChange: (authorIds: string[]) => void;
  onClearFilters: () => void;
};

type QueueOption = {
  value: AdminCommentsQueue;
  label: string;
  count: string | null;
};

export function useQueueOptions(pendingCount: number | undefined): QueueOption[] {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const labels: Record<AdminCommentsQueue, string> = {
    pending: t("admin:comments.filters.pending"),
    approved: t("admin:comments.filters.approved"),
    all: t("common:status.all"),
  };

  return ADMIN_COMMENTS_QUEUES.map((queue) => ({
    value: queue,
    label: labels[queue],
    count: queue === "pending" && pendingCount !== undefined ? pendingCount.toLocaleString(i18n.language) : null,
  }));
}
