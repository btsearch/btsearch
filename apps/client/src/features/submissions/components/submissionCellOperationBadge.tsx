import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { CellOperation } from "@/features/submissions/types";

const OPERATION_LABEL_KEY = {
  add: "batch.addOperation",
  update: "batch.updateOperation",
  delete: "actionSelector.delete",
} as const satisfies Record<CellOperation, string>;

const OPERATION_CLASS = {
  add: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  update: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  delete: "bg-destructive/10 text-destructive",
} satisfies Record<CellOperation, string>;

type SubmissionCellOperationBadgeProps = {
  operation: CellOperation;
  conflict?: boolean;
};

export function SubmissionCellOperationBadge({ operation, conflict = false }: SubmissionCellOperationBadgeProps) {
  const { t } = useTranslation("submissions");
  const className = conflict ? "bg-destructive/10 text-destructive" : OPERATION_CLASS[operation];

  return (
    <Badge variant="secondary" className={className}>
      {t(OPERATION_LABEL_KEY[operation])}
    </Badge>
  );
}
