import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Operator } from "../../types";
import { showReferenceError } from "../../utils/errors";
import { MarkedChoiceLabel } from "../shared/choiceLabels";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { useOpeningCount } from "../shared/useOpeningCount";
import { findBrand } from "./operatorBrands";
import { storeUpdatedOperator } from "./operatorCache";
import { joinSharedNetwork, listLinkCandidates } from "./operatorLinks";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";

export type OperatorLinkMode = "network" | "member";

type LinkFormProps = {
  operator: Operator;
  mode: OperatorLinkMode;
  isPending: boolean;
  onSubmit: (pickedOperator: Operator) => void;
  onCancel: () => void;
};

type OperatorLinkDialogProps = {
  operator: Operator;
  mode: OperatorLinkMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function LinkForm({ operator, mode, isPending, onSubmit, onCancel }: LinkFormProps) {
  const { t } = useTranslation("admin");
  const fieldTitleId = useId();
  const [shownOperator] = useState(operator);
  const [pickedOperatorId, setPickedOperatorId] = useState<number | null>(null);
  const { data: operators, isError, isFetching, refetch } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());

  const isNetworkMode = mode === "network";
  const candidates = listLinkCandidates(shownOperator, operators);
  const pickedOperator = operators?.find((candidate) => candidate.id === pickedOperatorId);
  const hasNoChoices = operators !== undefined && candidates.length === 0;
  const canSubmit = pickedOperator !== undefined && !isPending;

  function pickOperator(value: string | null) {
    setPickedOperatorId(value === null ? null : Number(value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pickedOperator !== undefined && canSubmit) onSubmit(pickedOperator);
  }

  let operatorControl: ReactNode;
  if (operators !== undefined) {
    operatorControl = (
      <Select value={pickedOperatorId === null ? null : String(pickedOperatorId)} onValueChange={pickOperator} disabled={hasNoChoices || isPending}>
        <SelectTrigger aria-labelledby={fieldTitleId} className="w-full cursor-pointer">
          <SelectValue placeholder={isNetworkMode ? t("reference.operator.linkDialog.networkPlaceholder") : t("common:placeholder.selectOperator")}>
            {pickedOperator ? <MarkedChoiceLabel look={findBrand(brands, pickedOperator.brandId)} name={pickedOperator.name} /> : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={String(candidate.id)} className="cursor-pointer">
              <MarkedChoiceLabel look={findBrand(brands, candidate.brandId)} name={candidate.name} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (isError) {
    operatorControl = (
      <InlineError size="sm" title={t("reference.operator.networks.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
    );
  } else {
    operatorControl = <Skeleton className="h-8 w-full rounded-lg" />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-7">
          {isNetworkMode ? t("reference.operator.linkDialog.networkTitle") : t("reference.operator.members.add")}
        </DialogTitle>
        <DialogDescription>
          {isNetworkMode
            ? t("reference.operator.linkDialog.networkDescription", { name: shownOperator.name })
            : t("reference.operator.linkDialog.memberDescription", { name: shownOperator.name })}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldTitle id={fieldTitleId}>{isNetworkMode ? t("reference.operator.linkDialog.networkField") : t("common:labels.operator")}</FieldTitle>
        {operatorControl}
        <FieldDescription>{hasNoChoices ? t("reference.operator.linkDialog.noChoices") : t("reference.operator.linkDialog.hint")}</FieldDescription>
      </Field>
      <DialogFormFooter submitLabel={t("users.detail.grants.add")} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function OperatorLinkDialog({ operator, mode, open, onOpenChange }: OperatorLinkDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const linkMutation = useMutation({
    mutationFn: (pickedOperator: Operator) =>
      mode === "network" ? joinSharedNetwork(operator, pickedOperator.id) : joinSharedNetwork(pickedOperator, operator.id),
    onSuccess: (updatedMember) => {
      onOpenChange(false);
      storeUpdatedOperator(queryClient, updatedMember);
      toast.success(t("reference.operator.linkDialog.success"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.operator.linkDialog.failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!linkMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <LinkForm
          key={openingCount}
          operator={operator}
          mode={mode}
          isPending={linkMutation.isPending}
          onSubmit={(pickedOperator) => linkMutation.mutate(pickedOperator)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
