import { LockIcon, RankingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { showSettingsError } from "../../authErrors";
import { measurementListingQueryOptions, measurementSummaryQueryOptions, updateMeasurementListing } from "../../measurementQueries";
import { ownProfileQueryOptions } from "../../queries";
import { SETTINGS_SECTION_IDS } from "../../sections";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardFooter,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  scrollToSettingsSection,
} from "../settingsPrimitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { STATISTICS_LEADERBOARDS_KEY } from "@/features/statistics/queries";

export function LeaderboardCard({ userId }: { userId: string }) {
  const { t } = useTranslation("settings");
  const titleId = useId();
  const queryClient = useQueryClient();
  const { data: listing, isPending, isFetching, refetch } = useQuery(measurementListingQueryOptions(userId));
  const { data: profile } = useQuery(ownProfileQueryOptions(userId));

  const listingMutation = useMutation({
    mutationFn: updateMeasurementListing,
    onSuccess: (savedListing) => {
      queryClient.setQueryData(measurementListingQueryOptions(userId).queryKey, savedListing);
      void queryClient.invalidateQueries({ queryKey: measurementSummaryQueryOptions(userId).queryKey });
      void queryClient.invalidateQueries({ queryKey: STATISTICS_LEADERBOARDS_KEY });
    },
    onError: showSettingsError,
  });

  const isListed = listingMutation.isPending ? listingMutation.variables : (listing?.isListed ?? false);
  const isProfilePrivate = profile !== undefined && profile.visibility !== "public";

  return (
    <SettingsCard>
      {isPending ? (
        <SettingsRowSkeleton />
      ) : listing === undefined ? (
        <SettingsRowError title={t("measurements.leaderboard.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : (
        <SettingsRow
          icon={RankingIcon}
          title={t("measurements.leaderboard.title")}
          titleId={titleId}
          description={t("measurements.leaderboard.description")}
        >
          <Switch
            checked={isListed}
            disabled={listingMutation.isPending}
            onCheckedChange={(checked) => listingMutation.mutate(checked)}
            aria-labelledby={titleId}
          />
        </SettingsRow>
      )}
      {isListed && isProfilePrivate ? (
        <SettingsCardFooter>
          <p className={SETTINGS_DESCRIPTION_CLASS}>{t("measurements.leaderboard.privateProfile")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => scrollToSettingsSection(SETTINGS_SECTION_IDS.profile)}
          >
            <HugeiconsIcon icon={LockIcon} data-icon="inline-start" aria-hidden="true" />
            {t("measurements.leaderboard.profileSettings")}
          </Button>
        </SettingsCardFooter>
      ) : null}
    </SettingsCard>
  );
}
