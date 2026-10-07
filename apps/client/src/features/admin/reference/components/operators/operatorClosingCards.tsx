import { ArrowUpRight01Icon, Delete02Icon, Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteOperator } from "../../api/operators";
import type { Operator } from "../../types";
import { getKnownCount } from "../shared/loadable";
import { RecordDeleteDialog } from "../shared/recordDeleteDialog";
import { ReferenceCard, ReferenceCardHeader } from "../shared/referenceCards";
import { listNetworkMembers } from "./operatorLinks";
import { useOperatorActiveStations } from "./useOperatorActiveStations";
import { Button, buttonVariants } from "@/components/ui/button";
import { operatorsQueryOptions } from "@/features/shared/lookups";

type OperatorDeleteCardProps = {
  operator: Operator;
  onDeleted: () => void;
};

const STRETCHED_CLASS = "flex-1";
const OPEN_LINK_CLASS = buttonVariants({ variant: "outline", size: "sm" });

export function OperatorAuditCard({ operator }: { operator: Operator }) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceCard className={STRETCHED_CLASS}>
      <ReferenceCardHeader
        className={STRETCHED_CLASS}
        icon={Note01Icon}
        title={t("nav:items.auditLogs")}
        description={t("reference.operator.audit.description")}
        action={
          <Link to="/admin/audit-logs" search={{ q: String(operator.id) }} className={OPEN_LINK_CLASS}>
            {t("reference.operator.actions.open")}
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
          </Link>
        }
      />
    </ReferenceCard>
  );
}

export function OperatorDeleteCard({ operator, onDeleted }: OperatorDeleteCardProps) {
  const { t } = useTranslation("admin");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { data: operators } = useQuery(operatorsQueryOptions());
  const stations = useOperatorActiveStations(operator.id);

  const stationCount = getKnownCount(stations);
  const memberCount = listNetworkMembers(operator.id, operators).length;
  const isBlocked = stationCount > 0 || memberCount > 0;
  let description = t("reference.operator.delete.description");
  if (stationCount > 0) description = t("reference.operator.delete.hasStations", { count: stationCount });
  else if (memberCount > 0) description = t("reference.operator.delete.hasMembers", { count: memberCount });

  return (
    <ReferenceCard tone="destructive" className={STRETCHED_CLASS}>
      <ReferenceCardHeader
        className={STRETCHED_CLASS}
        icon={Delete02Icon}
        iconTone="destructive"
        title={t("reference.operator.delete.title")}
        description={description}
        action={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="cursor-pointer"
            disabled={isBlocked}
            onClick={() => setIsConfirmOpen(true)}
          >
            {t("common:actions.delete")}
          </Button>
        }
      />
      <RecordDeleteDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("reference.operator.delete.confirmTitle")}
        description={t("reference.operator.delete.confirmDescription", { name: operator.name })}
        confirmLabel={t("reference.operator.delete.title")}
        deletedMessage={t("reference.operator.delete.success")}
        refusedTitle={t("reference.operator.delete.refusedTitle")}
        deleteFailedKey="admin:reference.operator.delete.failed"
        deleteRecord={() => deleteOperator(operator.id)}
        onDeleted={onDeleted}
      />
    </ReferenceCard>
  );
}
