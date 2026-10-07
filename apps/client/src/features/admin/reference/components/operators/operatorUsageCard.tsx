import { AirportTowerIcon, ArrowRight01Icon, Building03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { structureOwnersQueryOptions } from "../../api/structureOwners";
import { ownerLocationCountQueryOptions } from "../../api/usage";
import type { Operator, StructureOwner } from "../../types";
import { ReferenceCard, ReferenceCardHeader, ReferenceRow, ReferenceRowError, ReferenceRowSkeleton } from "../shared/referenceCards";
import { CountValue } from "../shared/values";
import { useOperatorActiveStations } from "./useOperatorActiveStations";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toOperatorStationsListSearch } from "@/features/stations/list/data/stationsListSearch";
import { cn } from "@/lib/utils";

const STAT_VALUE_CLASS = "text-lg leading-7 font-semibold tabular-nums";
const OPEN_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground");
const ROW_LINK_CLASS = cn(
  "block border-t transition-colors first:border-t-0 hover:bg-muted/50",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
);

function findOperatorOwner(owners: readonly StructureOwner[] | undefined, operatorId: number): StructureOwner | undefined {
  return owners?.find((owner) => owner.operatorId === operatorId);
}

function OwnerLocationCountPreload({ ownerId }: { ownerId: number }) {
  usePrefetchQuery(ownerLocationCountQueryOptions(ownerId));

  return null;
}

export function OperatorOwnerPreload({ operatorId }: { operatorId: number }) {
  const { data: owners } = useQuery(structureOwnersQueryOptions());
  const owner = findOperatorOwner(owners, operatorId);

  return owner === undefined ? null : <OwnerLocationCountPreload ownerId={owner.id} />;
}

function OwnerSummary({ owner }: { owner: StructureOwner }) {
  const { t } = useTranslation("admin");
  const { data: locationCount, isPending } = useQuery(ownerLocationCountQueryOptions(owner.id));

  if (locationCount !== undefined) return `${owner.name}, ${t("auditLogs.counts.locations", { count: locationCount })}`;
  if (!isPending) return owner.name;

  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span className="truncate">{owner.name}</span>
      <Skeleton aria-hidden="true" className="h-3 w-20 shrink-0" />
    </span>
  );
}

function OwnerRow({ operator }: { operator: Operator }) {
  const { t } = useTranslation("admin");
  const { data: owners, isError, isFetching, refetch } = useQuery(structureOwnersQueryOptions());

  if (owners === undefined) {
    if (!isError) return <ReferenceRowSkeleton />;
    return <ReferenceRowError title={t("reference.operator.usage.owner.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  const owner = findOperatorOwner(owners, operator.id);

  return (
    <ReferenceRow
      icon={Building03Icon}
      title={t("reference.operator.usage.owner.title")}
      description={owner === undefined ? t("reference.operator.usage.owner.none") : <OwnerSummary owner={owner} />}
    >
      <Link to="/admin/structure-owners" className={OPEN_LINK_CLASS}>
        {t("reference.operator.actions.open")}
        <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
      </Link>
    </ReferenceRow>
  );
}

export function OperatorUsageCard({ operator }: { operator: Operator }) {
  const { t } = useTranslation("admin");
  const stations = useOperatorActiveStations(operator.id);

  return (
    <ReferenceCard>
      <ReferenceCardHeader title={t("reference.operator.usage.title")} description={t("reference.operator.usage.description")} />
      <div className="border-t">
        <Link to="/admin/stations" search={toOperatorStationsListSearch(operator)} className={ROW_LINK_CLASS}>
          <ReferenceRow
            icon={AirportTowerIcon}
            title={t("reference.operators.columns.activeStations")}
            description={t("reference.operator.usage.stationsLink")}
          >
            <span className={STAT_VALUE_CLASS}>
              <CountValue count={stations} skeletonClassName="h-6 w-14" />
            </span>
            <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 text-muted-foreground" />
          </ReferenceRow>
        </Link>
        <OwnerRow operator={operator} />
      </div>
    </ReferenceCard>
  );
}
