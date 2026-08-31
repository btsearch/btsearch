import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SubmissionListItem } from "@/features/admin/submissions/types";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import type { Operator } from "@/types/station";

import {
  SubmissionChangesSummary,
  SubmissionStationSummary,
  SubmissionStatusSummary,
  SubmissionSubmitterSummary,
  SubmissionTimestamp,
} from "./submissionListParts";

const columnHelper = createColumnHelper<AppTableFeatures, SubmissionListItem>();

export function useSubmissionsColumns({
  sortOrder,
  onSortToggle,
  getOperatorById,
}: {
  sortOrder: "asc" | "desc";
  onSortToggle: () => void;
  getOperatorById: (operatorId: number | null | undefined) => Operator | undefined;
}) {
  const { t } = useTranslation(["submissions", "common"]);

  return useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "station",
          header: t("common:labels.station"),
          size: 220,
          cell: ({ row }) => <SubmissionStationSummary submission={row.original} getOperatorById={getOperatorById} />,
        }),
        columnHelper.display({
          id: "changes",
          header: () => <span title={t("table.cellCountsLegend")}>{t("table.changes")}</span>,
          size: 190,
          cell: ({ row }) => <SubmissionChangesSummary submission={row.original} />,
        }),
        columnHelper.display({
          id: "submitter",
          header: t("detail.submitter"),
          size: 220,
          cell: ({ row }) => <SubmissionSubmitterSummary submission={row.original} />,
        }),
        columnHelper.accessor("createdAt", {
          header: () => (
            <button
              type="button"
              className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onSortToggle}
              aria-label={`${t("common:labels.submitted")}: ${sortOrder === "asc" ? t("table.sortAscending") : t("table.sortDescending")}`}
            >
              {t("common:labels.submitted")}
              <HugeiconsIcon
                icon={Sorting05Icon}
                className="size-3.5 text-foreground transition-transform"
                style={sortOrder === "asc" ? { transform: "scaleY(-1)" } : undefined}
              />
            </button>
          ),
          size: 145,
          enableSorting: true,
          cell: ({ getValue }) => <SubmissionTimestamp value={getValue()} />,
        }),
        columnHelper.display({
          id: "review",
          header: t("table.review"),
          size: 170,
          cell: ({ row }) => <SubmissionStatusSummary submission={row.original} inline />,
        }),
      ]),
    [getOperatorById, onSortToggle, sortOrder, t],
  );
}
