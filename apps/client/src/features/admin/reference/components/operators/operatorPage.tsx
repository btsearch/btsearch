import { CellularNetworkIcon } from "@hugeicons/core-free-icons";
import { usePrefetchQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { operatorQueryOptions } from "../../api/operators";
import { stationBreakdownQueryOptions } from "../../api/statistics";
import { ReferenceStack } from "../shared/referenceCards";
import { BackToListButton, ReferenceDetailShell, ReferenceDetailSkeleton, ReferenceNotFound, useReturnToList } from "../shared/referenceDetailShell";
import { REFERENCE_TWO_COLUMN_CLASS, ReferenceSection } from "../shared/referenceSection";
import { discardDeletedOperator } from "./operatorCache";
import { OperatorAuditCard, OperatorDeleteCard } from "./operatorClosingCards";
import { OperatorDetailsCard } from "./operatorDetailsCard";
import { OperatorHero } from "./operatorHero";
import { OperatorNetworksCard } from "./operatorNetworksCard";
import { OperatorPlmnCard } from "./operatorPlmnCard";
import { OperatorOwnerPreload, OperatorUsageCard } from "./operatorUsageCard";
import { PageErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";

type OperatorPageProps = {
  operatorId: number | null;
};

const OPERATOR_LIST_PATH = "/admin/operators";

function OperatorNotFound() {
  const { t } = useTranslation("admin");

  return (
    <ReferenceNotFound
      icon={CellularNetworkIcon}
      title={t("reference.operator.notFound.title")}
      description={t("reference.operator.notFound.description")}
      listPath={OPERATOR_LIST_PATH}
    />
  );
}

function OperatorPagePreload({ operatorId }: { operatorId: number }) {
  usePrefetchQuery(operatorsQueryOptions());
  usePrefetchQuery(brandsQueryOptions());
  usePrefetchQuery(stationBreakdownQueryOptions("operator"));

  return <OperatorOwnerPreload operatorId={operatorId} />;
}

function OperatorDetail({ operatorId }: { operatorId: number }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const returnToList = useReturnToList(OPERATOR_LIST_PATH);
  const [mountedAt] = useState(Date.now);
  const [isDeleted, setIsDeleted] = useState(false);
  const {
    data: operator,
    dataUpdatedAt,
    isFetching,
    isFetchedAfterMount,
    isRefetchError,
    refetch,
  } = useQuery({ ...operatorQueryOptions(operatorId), enabled: !isDeleted });

  const isOperatorFresh = operator !== undefined && dataUpdatedAt >= mountedAt;
  const isOperatorPending = !isOperatorFresh && !isFetchedAfterMount;
  const listLabel = t("nav:items.operators");

  function leaveDeletedOperator() {
    setIsDeleted(true);
    discardDeletedOperator(queryClient, operatorId);
    returnToList();
  }

  if (isDeleted || isOperatorPending) {
    return (
      <ReferenceDetailShell backTo={OPERATOR_LIST_PATH} backLabel={listLabel}>
        <ReferenceDetailSkeleton />
      </ReferenceDetailShell>
    );
  }

  if (!isOperatorFresh) {
    return (
      <PageErrorState onRetry={() => refetch()} isRetrying={isFetching} action={<BackToListButton to={OPERATOR_LIST_PATH} variant="outline" />} />
    );
  }

  if (operator === null) return <OperatorNotFound />;

  return (
    <ReferenceDetailShell
      backTo={OPERATOR_LIST_PATH}
      backLabel={listLabel}
      notice={isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null}
    >
      <div className="flex flex-col gap-10 sm:gap-12">
        <OperatorHero operator={operator} />
        <ReferenceSection id="operator-details" title={t("reference.operator.sections.details")}>
          <OperatorDetailsCard operator={operator} />
        </ReferenceSection>
        <ReferenceSection id="operator-network" title={t("reference.operator.sections.network")}>
          <div className={REFERENCE_TWO_COLUMN_CLASS}>
            <OperatorPlmnCard operator={operator} />
            <OperatorNetworksCard operator={operator} />
          </div>
        </ReferenceSection>
        <ReferenceSection id="operator-usage" title={t("reference.operator.sections.usage")}>
          <div className={REFERENCE_TWO_COLUMN_CLASS}>
            <OperatorUsageCard operator={operator} />
            <ReferenceStack>
              <OperatorAuditCard operator={operator} />
              <OperatorDeleteCard operator={operator} onDeleted={leaveDeletedOperator} />
            </ReferenceStack>
          </div>
        </ReferenceSection>
      </div>
    </ReferenceDetailShell>
  );
}

export function OperatorPage({ operatorId }: OperatorPageProps) {
  if (operatorId === null) return <OperatorNotFound />;

  return (
    <>
      <OperatorPagePreload operatorId={operatorId} />
      <OperatorDetail key={operatorId} operatorId={operatorId} />
    </>
  );
}
