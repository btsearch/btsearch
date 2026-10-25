import { Add01Icon, Cancel01Icon, Link04Icon, PencilEdit02Icon, Tick02Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlag } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getApplyRoute, listFlagButtons } from "../model/kinds";
import { getEditLabel } from "./detailText";
import { Button, buttonVariants } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";

type FooterDialog = "dismiss" | "ignore" | "link";

type FlagFooterProps = {
  flag: ObservationFlag;
  hasSite: boolean;
  applyLabel: string;
  isBusy: boolean;
  isApplyDisabled: boolean;
  onOpenDialog: (dialog: FooterDialog) => void;
  onApply: () => void;
};

type EditLinkProps = {
  flag: ObservationFlag;
};

const FOOTER_BUTTON_CLASS = "cursor-pointer";

function EditLink({ flag }: EditLinkProps) {
  const { t } = useTranslation("admin");
  const className = buttonVariants({ variant: "outline", className: FOOTER_BUTTON_CLASS });
  const content = (
    <>
      <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" aria-hidden="true" />
      {getEditLabel(flag, t)}
    </>
  );

  if (flag.kind === "untrustedContributor" && flag.userId !== null) {
    return (
      <Link to="/admin/measurements/contributors/$userId" params={{ userId: flag.userId }} className={className}>
        {content}
      </Link>
    );
  }
  if (flag.stationId === null) return null;
  return (
    <Link to="/admin/stations/$id" params={{ id: String(flag.stationId) }} search={{ officialSite: undefined }} className={className}>
      {content}
    </Link>
  );
}

export function FlagFooter({ flag, hasSite, applyLabel, isBusy, isApplyDisabled, onOpenDialog, onApply }: FlagFooterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const buttons = listFlagButtons(flag);
  const applyRoute = getApplyRoute(flag);
  const isOpen = flag.status === "open";

  return (
    <footer className="flex min-h-[57px] shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {t("observationFlags.meta.created")} <RelativeTime date={flag.createdAt} /> · {t(`observationFlags.meta.${isOpen ? "updated" : flag.status}`)}{" "}
        <RelativeTime date={isOpen ? flag.updatedAt : (flag.resolvedAt ?? flag.updatedAt)} />
      </span>
      {buttons.includes("dismiss") ? (
        <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} disabled={isBusy} onClick={() => onOpenDialog("dismiss")}>
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("observationFlags.actions.dismiss")}
        </Button>
      ) : null}
      {buttons.includes("ignore") && hasSite ? (
        <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} disabled={isBusy} onClick={() => onOpenDialog("ignore")}>
          <HugeiconsIcon icon={ViewOffSlashIcon} data-icon="inline-start" aria-hidden="true" />
          {t("observationFlags.actions.ignore")}
        </Button>
      ) : null}
      {buttons.includes("link") && hasSite ? (
        <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} disabled={isBusy} onClick={() => onOpenDialog("link")}>
          <HugeiconsIcon icon={Link04Icon} data-icon="inline-start" aria-hidden="true" />
          {t("observationFlags.actions.link")}
        </Button>
      ) : null}
      {buttons.includes("edit") ? <EditLink flag={flag} /> : null}
      {applyRoute === "station" && flag.observedSiteId !== null ? (
        <Link
          to="/admin/observation-flags/sites/$id/station"
          params={{ id: String(flag.observedSiteId) }}
          search={{ flag: flag.id }}
          className={buttonVariants({ className: FOOTER_BUTTON_CLASS })}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("common:actions.createStation")}
        </Link>
      ) : null}
      {applyRoute !== null && applyRoute !== "station" ? (
        <Button type="button" className={FOOTER_BUTTON_CLASS} disabled={isApplyDisabled} onClick={onApply}>
          <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden="true" />
          {applyLabel}
        </Button>
      ) : null}
    </footer>
  );
}
