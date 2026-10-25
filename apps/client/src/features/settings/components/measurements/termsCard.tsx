import { ArrowUpRight01Icon, LegalDocument01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementTerms } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../../authErrors";
import { acceptMeasurementTerms, measurementTermsQueryOptions } from "../../measurementQueries";
import { SettingsCard, SettingsCardHeader, SettingsRow, StatusBadge } from "../settingsPrimitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatShortDate } from "@/lib/format";

const CONTRIBUTOR_TERMS_PATH = "/terms";

export function TermsCard({ userId, terms, canAccept }: { userId: string; terms: MeasurementTerms; canAccept: boolean }) {
  const { t, i18n } = useTranslation("settings");
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => acceptMeasurementTerms(terms.currentVersion),
    onSuccess: (acceptedTerms) => {
      toast.success(t("measurements.terms.acceptSuccess"));
      queryClient.setQueryData(measurementTermsQueryOptions(userId).queryKey, acceptedTerms);
    },
    onError: showSettingsError,
  });

  const isOutdated = terms.acceptedVersion !== terms.currentVersion;
  const acceptedOn =
    terms.acceptedAt === null ? null : t("measurements.terms.acceptedOn", { date: formatShortDate(terms.acceptedAt, i18n.language) });

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.terms.title")} />
      <div className="border-t">
        <SettingsRow
          wrap={isOutdated}
          icon={LegalDocument01Icon}
          title={t("measurements.terms.version", { version: terms.acceptedVersion })}
          badge={
            isOutdated ? (
              <StatusBadge tone="warning">{t("measurements.terms.newVersion", { version: terms.currentVersion })}</StatusBadge>
            ) : (
              <StatusBadge tone="success">{t("measurements.terms.accepted")}</StatusBadge>
            )
          }
          description={
            isOutdated ? (
              <>
                {acceptedOn !== null ? <span className="block">{acceptedOn}</span> : null}
                {canAccept ? <span className="block">{t("measurements.terms.acceptHint")}</span> : null}
              </>
            ) : (
              acceptedOn
            )
          }
        >
          <Link to={CONTRIBUTOR_TERMS_PATH} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("measurements.terms.read")}
          </Link>
          {isOutdated && canAccept ? (
            <Button type="button" size="sm" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate()}>
              {acceptMutation.isPending ? <Spinner /> : null}
              {t("measurements.terms.accept", { version: terms.currentVersion })}
            </Button>
          ) : null}
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}
