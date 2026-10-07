import { ArrowUpRight01Icon, Delete02Icon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { deleteCountry } from "../../api/countries";
import { invalidateOperators, invalidateRegions, invalidateStructureOwners, invalidateTeam } from "../../api/queryKeys";
import { structureOwnersQueryOptions } from "../../api/structureOwners";
import { teamGrantsQueryOptions } from "../../api/team";
import type { Country } from "../../types";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { type DeleteBlocker, DeleteRefusedDialog } from "../shared/deleteRefusedDialog";
import { ConfirmDialog, ReferenceCard, ReferenceCardHeader } from "../shared/referenceCards";
import { REFERENCE_TWO_COLUMN_CLASS, ReferenceSection } from "../shared/referenceSection";
import { EMPTY_VALUE } from "../shared/values";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { Button, buttonVariants } from "@/components/ui/button";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { isConflict } from "@/lib/api";
import { getCountryName } from "@/lib/geo/countryName";

type ClosingSectionProps = {
  country: Country;
  onRemoved: () => void;
};

const AUDIT_LINK_CLASS = buttonVariants({ variant: "outline", size: "sm" });

function AuditLogCard({ countryCode }: { countryCode: string }) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        icon={WorkHistoryIcon}
        title={t("reference.country.closing.audit.title")}
        description={t("reference.country.closing.audit.description")}
        action={
          <Link to="/admin/audit-logs" search={{ countries: countryCode }} className={AUDIT_LINK_CLASS}>
            {t("reference.country.closing.audit.open")}
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
          </Link>
        }
      />
    </ReferenceCard>
  );
}

function DeleteCountryCard({ country, onRemoved }: ClosingSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRefusalOpen, setIsRefusalOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");
  const regionsQuery = useQuery(regionsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const ownersQuery = useQuery(structureOwnersQueryOptions());
  const teamQuery = useQuery({ ...teamGrantsQueryOptions([country.code]), refetchOnMount: false });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCountry(country.code),
    onSuccess: () => {
      toast.success(t("reference.country.closing.delete.success"));
      onRemoved();
    },
    onError: (error) => {
      if (!isConflict(error)) {
        showReferenceError(error, "admin:reference.country.closing.delete.failed");
        return;
      }
      setRefusalReason(getReferenceErrorMessage(t, error, "admin:reference.country.closing.delete.failed"));
      setIsConfirmOpen(false);
      setIsRefusalOpen(true);
      void Promise.all([
        invalidateRegions(queryClient),
        invalidateOperators(queryClient),
        invalidateStructureOwners(queryClient),
        invalidateTeam(queryClient),
      ]);
    },
  });

  const countryName = getCountryName(country.code, i18n.language);
  const regionCount = regionsQuery.data?.filter((region) => region.countryCode === country.code).length;
  const operatorCount = operatorsQuery.data?.filter((operator) => operator.countryCode === country.code).length;
  const ownerCount = ownersQuery.data?.filter((owner) => owner.countryCode === country.code).length;
  const grantCount = teamQuery.data?.length;
  const hasKnownBlockers = [regionCount, operatorCount, ownerCount, grantCount].some((count) => count !== undefined && count > 0);
  const isCheckingBlockers = regionsQuery.isPending || operatorsQuery.isPending || ownersQuery.isPending || teamQuery.isPending;
  const isRemoving = deleteMutation.isPending || deleteMutation.isSuccess;

  function formatBlockerCount(count: number | undefined): string {
    return count === undefined ? EMPTY_VALUE : count.toLocaleString(i18n.language);
  }

  const blockers: DeleteBlocker[] = [
    { label: t("reference.country.regions.title"), value: formatBlockerCount(regionCount) },
    { label: t("nav:items.operators"), value: formatBlockerCount(operatorCount) },
    { label: t("nav:items.structureOwners"), value: formatBlockerCount(ownerCount) },
    { label: t("admin:auditLogs.groups.grant"), value: formatBlockerCount(grantCount) },
  ];

  return (
    <ReferenceCard tone="destructive">
      <ReferenceCardHeader
        icon={Delete02Icon}
        iconTone="destructive"
        title={t("reference.country.closing.delete.title")}
        description={<span id={reasonId}>{t("reference.country.closing.delete.description")}</span>}
        action={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="cursor-pointer"
            disabled={hasKnownBlockers || isCheckingBlockers}
            aria-describedby={reasonId}
            onClick={() => setIsConfirmOpen(true)}
          >
            {t("common:actions.delete")}
          </Button>
        }
      />
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!isRemoving) setIsConfirmOpen(open);
        }}
        title={t("reference.country.closing.delete.confirmTitle")}
        description={t("reference.country.closing.delete.confirmDescription", { name: countryName })}
        confirmLabel={t("reference.country.closing.delete.title")}
        pending={isRemoving}
        onConfirm={() => deleteMutation.mutate()}
      />
      <DeleteRefusedDialog
        open={isRefusalOpen}
        onOpenChange={setIsRefusalOpen}
        title={t("reference.country.closing.delete.refusedTitle")}
        description={hasKnownBlockers ? t("reference.country.closing.delete.refusedDescription", { name: countryName }) : refusalReason}
        blockers={hasKnownBlockers ? blockers : undefined}
      />
    </ReferenceCard>
  );
}

export function ClosingSection({ country, onRemoved }: ClosingSectionProps) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.history} title={t("reference.country.closing.title")}>
      <div className={REFERENCE_TWO_COLUMN_CLASS}>
        <AuditLogCard countryCode={country.code} />
        <DeleteCountryCard country={country} onRemoved={onRemoved} />
      </div>
    </ReferenceSection>
  );
}
