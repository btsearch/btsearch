import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ShareButton } from "../../../components/shareButton";
import { stationDialogHeaderIconActionClassName, stationDialogPrimaryActionClassName } from "../../../components/stationDialogHeaderStyles";
import type { StationEditTarget } from "../../access";
import type { StationRecord } from "../../types";

type StationPanelActionsProps = {
  station: StationRecord;
  editTarget: StationEditTarget | null;
  onClose: () => void;
};

export function StationPanelActions({ station, editTarget, onClose }: StationPanelActionsProps) {
  const { t } = useTranslation(["stationDetails", "common", "main"]);
  const operatorName = station.operator?.name ?? t("main:unknownOperator");
  const city = station.location?.city || t("common:labels.unknownLocation");
  const address = station.location?.address || null;
  const shareTitle = `${station.siteId} (${operatorName})`;
  const editLabel = (
    <>
      <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{t("common:actions.edit")}</span>
    </>
  );

  return (
    <>
      <ShareButton
        title={shareTitle}
        text={`${shareTitle} - ${city}${address !== null ? ` ${address}` : ""}`}
        url={`${window.location.origin}/stations/${station.id}`}
        size="md"
        className={stationDialogHeaderIconActionClassName}
      />
      {editTarget === "editor" ? (
        <Link
          to="/admin/stations/$id"
          params={{ id: String(station.id) }}
          search={{ uke: undefined }}
          className={stationDialogPrimaryActionClassName}
          onClick={onClose}
        >
          {editLabel}
        </Link>
      ) : null}
      {editTarget === "submission" ? (
        <Link to="/submission" search={{ station: String(station.id) }} className={stationDialogPrimaryActionClassName} onClick={onClose}>
          {editLabel}
        </Link>
      ) : null}
    </>
  );
}
