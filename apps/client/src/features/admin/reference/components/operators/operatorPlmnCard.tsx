import { Delete02Icon, FullSignalIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateOperator } from "../../api/operators";
import type { Operator, Plmn } from "../../types";
import { showReferenceError } from "../../utils/errors";
import { formatPlmn } from "../../utils/plmn";
import { CardAddButton } from "../shared/cardParts";
import {
  CenteredCardState,
  ConfirmDialog,
  ReferenceCard,
  ReferenceCardHeader,
  ReferenceCardNote,
  ReferenceRow,
  RowIconButton,
  StatusBadge,
} from "../shared/referenceCards";
import { storeUpdatedOperator } from "./operatorCache";
import { OperatorPlmnDialog } from "./operatorPlmnDialog";
import { listPlmnsWithout } from "./operatorPlmns";

type PlmnRowProps = {
  plmn: Plmn;
  onEdit: () => void;
  onRemove: () => void;
};

type PlmnRemoveDialogProps = {
  operator: Operator;
  plmn: Plmn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function PlmnRow({ plmn, onEdit, onRemove }: PlmnRowProps) {
  const { t } = useTranslation("admin");
  const code = formatPlmn(plmn.plmn);

  return (
    <ReferenceRow
      icon={FullSignalIcon}
      title={<span className="font-mono tabular-nums">{code}</span>}
      badge={
        plmn.role === "primary" ? (
          <StatusBadge tone="primary">{t("reference.operator.plmn.roles.primary")}</StatusBadge>
        ) : (
          <StatusBadge tone="muted">{t("reference.operator.plmn.roles.secondary")}</StatusBadge>
        )
      }
    >
      <RowIconButton label={t("reference.operator.plmn.edit", { plmn: code })} icon={PencilEdit02Icon} onClick={onEdit} />
      <RowIconButton label={t("reference.operator.plmn.remove", { plmn: code })} icon={Delete02Icon} destructive onClick={onRemove} />
    </ReferenceRow>
  );
}

function PlmnRemoveDialog({ operator, plmn, open, onOpenChange }: PlmnRemoveDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => updateOperator(operator.id, { plmns: listPlmnsWithout(operator.plmns, plmn.plmn) }),
    onSuccess: (updatedOperator) => {
      onOpenChange(false);
      storeUpdatedOperator(queryClient, updatedOperator);
      toast.success(t("reference.operator.plmn.removeDialog.success"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.operator.plmn.removeDialog.failed"),
  });

  const descriptionValues = { plmn: formatPlmn(plmn.plmn), name: operator.name };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!removeMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("reference.operator.plmn.removeDialog.title")}
      description={
        plmn.role === "primary"
          ? t("reference.operator.plmn.removeDialog.primaryDescription", descriptionValues)
          : t("reference.operator.plmn.removeDialog.description", descriptionValues)
      }
      confirmLabel={t("reference.operator.plmn.removeDialog.confirm")}
      pending={removeMutation.isPending}
      onConfirm={() => removeMutation.mutate()}
    />
  );
}

export function OperatorPlmnCard({ operator }: { operator: Operator }) {
  const { t } = useTranslation("admin");
  const [editedPlmn, setEditedPlmn] = useState<Plmn | null>(null);
  const [isPlmnDialogOpen, setIsPlmnDialogOpen] = useState(false);
  const [removedPlmn, setRemovedPlmn] = useState<Plmn | null>(null);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);

  function openPlmnDialog(plmn: Plmn | null) {
    setEditedPlmn(plmn);
    setIsPlmnDialogOpen(true);
  }

  function openRemoveDialog(plmn: Plmn) {
    setRemovedPlmn(plmn);
    setIsRemoveDialogOpen(true);
  }

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.operator.plmn.title")}
        description={t("reference.operator.plmn.description")}
        action={<CardAddButton label={t("reference.operator.plmn.add")} onClick={() => openPlmnDialog(null)} />}
      />
      {operator.plmns.length === 0 ? (
        <CenteredCardState
          icon={FullSignalIcon}
          title={t("reference.operator.plmn.empty.title")}
          description={t("reference.operator.plmn.empty.description")}
        />
      ) : (
        <div className="border-t">
          {operator.plmns.map((plmn) => (
            <PlmnRow key={plmn.plmn} plmn={plmn} onEdit={() => openPlmnDialog(plmn)} onRemove={() => openRemoveDialog(plmn)} />
          ))}
        </div>
      )}
      <ReferenceCardNote className="mt-auto">{t("reference.operator.plmn.note")}</ReferenceCardNote>
      <OperatorPlmnDialog operator={operator} editedPlmn={editedPlmn} open={isPlmnDialogOpen} onOpenChange={setIsPlmnDialogOpen} />
      {removedPlmn === null ? null : (
        <PlmnRemoveDialog operator={operator} plmn={removedPlmn} open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen} />
      )}
    </ReferenceCard>
  );
}
