import { CellularNetworkIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Brand, Operator } from "../../types";
import { showReferenceError } from "../../utils/errors";
import { BrandTile } from "../shared/brandTile";
import { CardAddButton, CardLoadState, CountBadge } from "../shared/cardParts";
import {
  CenteredCardState,
  ConfirmDialog,
  REFERENCE_DESCRIPTION_CLASS,
  ReferenceCard,
  ReferenceCardHeader,
  ReferenceCardNote,
  ReferenceStack,
  RowIconButton,
} from "../shared/referenceCards";
import { findBrand } from "./operatorBrands";
import { storeUpdatedOperator } from "./operatorCache";
import { OperatorLinkDialog, type OperatorLinkMode } from "./operatorLinkDialog";
import { leaveSharedNetwork, listNetworkMembers, listSharedNetworks } from "./operatorLinks";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

type Membership = {
  member: Operator;
  network: Operator;
};

type LinkedOperatorRowProps = {
  linkedOperator: Operator;
  brand: Brand | null;
  description: string;
  removeLabel: string;
  onRemove: () => void;
};

type MembershipRemoveDialogProps = Membership & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAME_SEPARATOR = ", ";
const SKELETON_ROW_COUNT = 2;
const ROW_CLASS = "relative flex items-center gap-3.5 border-t px-4 py-3.5 transition-colors first:border-t-0 hover:bg-muted/50 sm:px-5";
const ROW_LINK_CLASS = cn(
  "block truncate text-sm leading-5 font-medium outline-none after:absolute after:inset-0",
  "focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
);

function LinkedOperatorRow({ linkedOperator, brand, description, removeLabel, onRemove }: LinkedOperatorRowProps) {
  return (
    <div className={ROW_CLASS}>
      <BrandTile brand={brand} size={32} />
      <div className="min-w-0 flex-1">
        <Link to="/admin/operators/$id" params={{ id: String(linkedOperator.id) }} className={ROW_LINK_CLASS}>
          {linkedOperator.name}
        </Link>
        <p className={cn("mt-0.5 truncate", REFERENCE_DESCRIPTION_CLASS)}>{description}</p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <RowIconButton label={removeLabel} icon={Delete02Icon} destructive onClick={onRemove} />
      </div>
    </div>
  );
}

function MembershipRemoveDialog({ member, network, open, onOpenChange }: MembershipRemoveDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => leaveSharedNetwork(member, network.id),
    onSuccess: (updatedMember) => {
      onOpenChange(false);
      storeUpdatedOperator(queryClient, updatedMember);
      toast.success(t("reference.operator.networks.removeDialog.success"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.operator.networks.removeDialog.failed"),
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!removeMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("reference.operator.networks.removeDialog.title")}
      description={t("reference.operator.networks.removeDialog.description", { member: member.name, network: network.name })}
      confirmLabel={t("common:actions.remove")}
      pending={removeMutation.isPending}
      onConfirm={() => removeMutation.mutate()}
    />
  );
}

export function OperatorNetworksCard({ operator }: { operator: Operator }) {
  const { t, i18n } = useTranslation("admin");
  const [linkMode, setLinkMode] = useState<OperatorLinkMode>("network");
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [removedMembership, setRemovedMembership] = useState<Membership | null>(null);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const { data: operators, isError, isFetching, refetch } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());

  const networks = listSharedNetworks(operator, operators);
  const members = listNetworkMembers(operator.id, operators);
  const hasMembers = members.length > 0;
  const hasOwnNetworks = operator.links.length > 0;

  function openLinkDialog(mode: OperatorLinkMode) {
    setLinkMode(mode);
    setIsLinkDialogOpen(true);
  }

  function openRemoveDialog(membership: Membership) {
    setRemovedMembership(membership);
    setIsRemoveDialogOpen(true);
  }

  function listMemberNames(network: Operator): string {
    return listNetworkMembers(network.id, operators)
      .map((member) => member.name)
      .join(NAME_SEPARATOR);
  }

  let networkRows: ReactNode;
  if (operators === undefined) {
    networkRows = (
      <CardLoadState
        hasLoadFailed={isError}
        errorTitle={t("reference.operator.networks.loadFailed")}
        isRetrying={isFetching}
        onRetry={() => void refetch()}
        skeletonRowCount={SKELETON_ROW_COUNT}
      />
    );
  } else if (networks.length === 0) {
    networkRows = (
      <CenteredCardState
        icon={CellularNetworkIcon}
        title={t("reference.operator.networks.empty.title")}
        description={t("reference.operator.networks.empty.description")}
      />
    );
  } else {
    networkRows = (
      <div className="border-t">
        {networks.map((network) => (
          <LinkedOperatorRow
            key={network.id}
            linkedOperator={network}
            brand={findBrand(brands, network.brandId)}
            description={t("reference.operator.networks.members", { names: listMemberNames(network) })}
            removeLabel={t("reference.operator.networks.remove", { name: network.name })}
            onRemove={() => openRemoveDialog({ member: operator, network })}
          />
        ))}
      </div>
    );
  }

  const networksCard = (
    <ReferenceCard className={hasMembers ? "flex-1" : undefined}>
      <ReferenceCardHeader
        title={t("reference.operator.networks.title")}
        description={t("reference.operator.networks.description")}
        action={
          <CardAddButton label={t("reference.operator.networks.add")} disabled={operators === undefined} onClick={() => openLinkDialog("network")} />
        }
      />
      {networkRows}
      <ReferenceCardNote className="mt-auto">{t("reference.operator.networks.note")}</ReferenceCardNote>
    </ReferenceCard>
  );
  const membersCard = (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.operator.members.title")}
        description={t("reference.operator.members.description")}
        badge={<CountBadge>{members.length.toLocaleString(i18n.language)}</CountBadge>}
        action={
          <CardAddButton label={t("reference.operator.members.add")} disabled={operators === undefined} onClick={() => openLinkDialog("member")} />
        }
      />
      <div className="border-t">
        {members.map((member) => (
          <LinkedOperatorRow
            key={member.id}
            linkedOperator={member}
            brand={findBrand(brands, member.brandId)}
            description={member.legalName}
            removeLabel={t("reference.operator.members.remove", { name: member.name })}
            onRemove={() => openRemoveDialog({ member, network: operator })}
          />
        ))}
      </div>
      <ReferenceCardNote className="mt-auto">{t("reference.operator.members.note")}</ReferenceCardNote>
    </ReferenceCard>
  );

  let cards = networksCard;
  if (hasMembers) {
    cards = hasOwnNetworks ? (
      <ReferenceStack>
        {membersCard}
        {networksCard}
      </ReferenceStack>
    ) : (
      membersCard
    );
  }

  return (
    <>
      {cards}
      <OperatorLinkDialog operator={operator} mode={linkMode} open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen} />
      {removedMembership === null ? null : (
        <MembershipRemoveDialog
          member={removedMembership.member}
          network={removedMembership.network}
          open={isRemoveDialogOpen}
          onOpenChange={setIsRemoveDialogOpen}
        />
      )}
    </>
  );
}
