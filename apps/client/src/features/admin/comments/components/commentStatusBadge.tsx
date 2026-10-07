import type { CommentStatus } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

type CommentStatusBadgeProps = {
  status: CommentStatus;
};

const PENDING_CLASS = "bg-amber-500/10 text-amber-700 dark:text-amber-400";

export function CommentStatusBadge({ status }: CommentStatusBadgeProps) {
  const { t } = useTranslation("admin");

  if (status === "pending") {
    return (
      <Badge variant="secondary" className={PENDING_CLASS}>
        {t("comments.status.pending")}
      </Badge>
    );
  }

  return <Badge variant="secondary">{t("comments.status.approved")}</Badge>;
}
