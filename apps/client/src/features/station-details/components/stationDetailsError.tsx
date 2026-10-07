import { SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ApiResponseError } from "@/lib/api";

type StationDetailsErrorProps = {
  error: unknown;
  onRetry: () => unknown;
  isRetrying: boolean;
  onClose: () => void;
};

export function StationDetailsError({ error, onRetry, isRetrying, onClose }: StationDetailsErrorProps) {
  const { t } = useTranslation(["stationDetails", "common"]);

  return (
    <div className="px-3 py-4 sm:p-6">
      {error instanceof ApiResponseError && error.status === 404 ? (
        <ErrorState
          tone="neutral"
          icon={SearchRemoveIcon}
          title={t("page.stationNotFoundTitle")}
          description={t("page.stationNotFoundDescription")}
          action={
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common:actions.close")}
            </Button>
          }
        />
      ) : (
        <ErrorState title={t("page.stationUnavailableTitle")} onRetry={onRetry} isRetrying={isRetrying} />
      )}
    </div>
  );
}
