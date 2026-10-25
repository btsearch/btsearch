import { ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservedSite } from "@openbts/shared/contract";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateObservedSite } from "../../api/sites";
import { type QueueConflict, reportQueueError } from "../../model/conflicts";
import { formatSiteLabel } from "../../model/format";
import { EstimatedLabel } from "../flagSubjectMark";
import { QueueDialog } from "./queueDialog";
import { ReasonField } from "./reasonField";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";

type IgnoreSiteDialogProps = {
  site: ObservedSite;
  details: string;
  isGroup: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIgnored: (site: ObservedSite) => void;
  onConflict: (conflict: QueueConflict) => void;
};

type IgnoreFormProps = Omit<IgnoreSiteDialogProps, "open" | "onOpenChange"> & {
  onPendingChange: (isPending: boolean) => void;
  onCancel: () => void;
};

type SiteCardProps = {
  site: ObservedSite;
  details: string;
};

function SiteCard({ site, details }: SiteCardProps) {
  const { lookups } = useMapLookups();
  const { operator, brand } = getOperatorLook(lookups, site.operatorId);

  return (
    <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
      {operator === null ? null : <BrandMark brand={brand} size={16} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">
          {formatSiteLabel(site, lookups)} <EstimatedLabel />
        </span>
        {details === "" ? null : <span className="truncate text-xs text-muted-foreground">{details}</span>}
      </span>
    </div>
  );
}

function IgnoreForm({ site, details, isGroup, onIgnored, onConflict, onPendingChange, onCancel }: IgnoreFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [reason, setReason] = useState("");
  const ignoreMutation = useMutation({
    mutationFn: (text: string) => updateObservedSite(site.id, { ignore: { reason: text } }),
    onMutate: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: onIgnored,
    onError: (error) => reportQueueError(error, onConflict),
  });
  const isPending = ignoreMutation.isPending;
  const trimmedReason = reason.trim();
  const hint = isGroup ? `${t("observationFlags.ignore.hint")}. ${t("observationFlags.ignore.groupHint")}` : t("observationFlags.ignore.hint");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmedReason !== "" && !isPending) ignoreMutation.mutate(trimmedReason);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{t("observationFlags.ignore.title")}</DialogTitle>
        <DialogDescription>{t("observationFlags.ignore.description")}</DialogDescription>
      </DialogHeader>
      <SiteCard site={site} details={details} />
      <ReasonField
        label={t("observationFlags.ignore.reasonLabel")}
        placeholder={t("observationFlags.ignore.reasonPlaceholder")}
        hint={hint}
        value={reason}
        isDisabled={isPending}
        onChange={setReason}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={trimmedReason === "" || isPending}>
          {isPending ? <Spinner /> : <HugeiconsIcon icon={ViewOffSlashIcon} data-icon="inline-start" aria-hidden="true" />}
          {t("observationFlags.actions.ignore")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function IgnoreSiteDialog({ open, onOpenChange, ...formProps }: IgnoreSiteDialogProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <QueueDialog open={open} isPending={isPending} onOpenChange={onOpenChange}>
      <IgnoreForm {...formProps} onPendingChange={setIsPending} onCancel={() => onOpenChange(false)} />
    </QueueDialog>
  );
}
