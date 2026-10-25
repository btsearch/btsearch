import { Flag02Icon } from "@hugeicons/core-free-icons";
import type { ObservationFlag } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { flagQueryOptions } from "../api/flags";
import { FlagDetail } from "../detail/flagDetail";
import { FlagDetailFrame, FlagDetailSkeleton } from "../detail/flagDetailFrame";
import type { FlagOutcome } from "../detail/useFlagActions";
import { type QueueConflict, isForbidden } from "../model/conflicts";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isNotFound } from "@/lib/api";

type DetailPaneProps = {
  flagId: number | null;
  listedFlag: ObservationFlag | undefined;
  conflict: QueueConflict | null;
  onConflict: (conflict: QueueConflict | null) => void;
  onClose: () => void;
  onOutcome: (outcome: FlagOutcome) => void;
  onShowFlag: (flagId: number) => void;
  onRefresh: () => void;
};

export function DetailPane({ flagId, listedFlag, conflict, onConflict, onClose, onOutcome, onShowFlag, onRefresh }: DetailPaneProps) {
  const { t } = useTranslation("admin");
  const flagQuery = useQuery(flagQueryOptions(listedFlag === undefined ? flagId : null));
  const flag = listedFlag ?? flagQuery.data;

  if (flagId === null) {
    return (
      <ErrorState
        tone="neutral"
        icon={Flag02Icon}
        className="h-full min-h-0"
        title={t("observationFlags.detail.pickTitle")}
        description={t("observationFlags.detail.pickDescription")}
      />
    );
  }
  if (flag !== undefined) {
    return (
      <FlagDetail
        key={flag.id}
        flag={flag}
        conflict={conflict}
        onConflict={onConflict}
        onClose={onClose}
        onOutcome={onOutcome}
        onShowFlag={onShowFlag}
        onRefresh={onRefresh}
      />
    );
  }
  if (!flagQuery.isError) return <FlagDetailSkeleton />;

  const isGone = isNotFound(flagQuery.error) || isForbidden(flagQuery.error);
  return (
    <FlagDetailFrame head={<h2 className="text-sm font-semibold">{t("observationFlags.detail.flagTitle", { id: flagId })}</h2>}>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {isGone ? (
          <ErrorState
            tone="neutral"
            className="flex-1"
            title={t("observationFlags.detail.goneTitle")}
            description={t("observationFlags.detail.goneDescription")}
            action={
              <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onClose}>
                {t("observationFlags.detail.backToList")}
              </Button>
            }
          />
        ) : (
          <ErrorState className="flex-1" onRetry={() => void flagQuery.refetch()} isRetrying={flagQuery.isFetching} />
        )}
      </div>
    </FlagDetailFrame>
  );
}
