import { AirportTowerIcon, Building02Icon, Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Operator, StationStatus } from "@openbts/shared/contract";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { findDraftOperator } from "../../model/snapshots";
import { listIdentifierKinds } from "../../model/validate";
import { EditCard } from "../frame/editCard";
import { editTargetProps } from "../frame/editTargets";
import { BackhaulDetailFields, BackhaulMediumField } from "./backhaulFields";
import { IdentifierRows } from "./identifierRows";
import { FieldGroup, getControlProps, getStationFieldView } from "./stationFields";
import { StationOperatorSelect } from "./stationOperatorSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { STATION_STATUS_TEXT_CLASSES } from "@/features/stations/components/StationStatusBadge";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type StationCardProps = {
  edit: StationDraftApi;
  stationId: number | null;
};

type StatusFieldProps = {
  edit: StationDraftApi;
  idPrefix: string;
};

type StatusLabelProps = {
  status: StationStatus;
};

const STATUSES: readonly StationStatus[] = ["active", "awaitingCells", "inactive"];
const STATUS_ICONS: Record<StationStatus, IconSvgElement> = {
  active: CheckmarkCircle02Icon,
  awaitingCells: Clock01Icon,
  inactive: Cancel01Icon,
};
const STATUS_LABEL_KEYS: Record<StationStatus, string> = {
  active: "stations:status.published",
  awaitingCells: "stations:status.pending",
  inactive: "stations:status.inactive",
};

function StatusLabel({ status }: StatusLabelProps) {
  const { t } = useTranslation("stations");

  return (
    <>
      <HugeiconsIcon
        icon={STATUS_ICONS[status]}
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", STATION_STATUS_TEXT_CLASSES[toV1StationStatus(status)])}
      />
      <span>{t(STATUS_LABEL_KEYS[status])}</span>
    </>
  );
}

function StatusField({ edit, idPrefix }: StatusFieldProps) {
  const { t } = useTranslation("common");
  const { status } = edit.session.draft.station;
  const view = getStationFieldView(edit, "status", idPrefix);

  function changeStatus(value: string | null) {
    const nextStatus = STATUSES.find((option) => option === value);
    if (nextStatus !== undefined) edit.dispatch({ type: "setStation", patch: { status: nextStatus } });
  }

  return (
    <FieldGroup view={view} label={t("labels.status")} isLabelLinked={false}>
      <Select value={status} onValueChange={changeStatus} disabled={!edit.canEdit}>
        <SelectTrigger {...getControlProps(view)} aria-labelledby={view.labelId} className={cn("cursor-pointer", view.className)}>
          <SelectValue>
            <StatusLabel status={status} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((option) => (
            <SelectItem key={option} value={option} className="cursor-pointer">
              <StatusLabel status={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldGroup>
  );
}

export function StationCard({ edit, stationId }: StationCardProps) {
  const { t } = useTranslation(["common", "submissions"]);
  const idPrefix = useId();
  const { session, dispatch, canEdit, lookups } = edit;
  const { station, place } = session.draft;
  const isEditor = session.kind === "editor";
  const isForm = session.kind === "form";
  const isLocked = !canEdit;
  const selectedOperator = findDraftOperator(session.draft, lookups.operatorsById);
  const hasKnownCountry = place !== null && place.regionId !== null;
  const operatorView = getStationFieldView(edit, "operatorId", idPrefix);
  const confirmedView = getStationFieldView(edit, "isConfirmed", idPrefix);
  const notesView = getStationFieldView(edit, "notes", idPrefix);

  function changeOperator(operator: Operator) {
    dispatch({ type: "setOperator", operatorId: operator.id, identifierKinds: listIdentifierKinds(operator) });
  }

  return (
    <EditCard
      title={t("submissions:stationInfo.title")}
      icon={isForm ? Building02Icon : AirportTowerIcon}
      className={session.kind === "review" ? "bg-card" : undefined}
    >
      <div className={cn("flex flex-col gap-4", isForm ? "p-4" : "px-4 py-3")} {...editTargetProps({ scope: "station" })}>
        <div className="flex flex-col gap-3">
          <div className={cn("flex flex-wrap gap-3", isEditor ? "items-end" : "items-start")}>
            <FieldGroup view={operatorView} label={t("labels.operator")} isLabelLinked={false}>
              <StationOperatorSelect
                operators={hasKnownCountry ? lookups.countryOperators : lookups.operators}
                brands={lookups.brands}
                selected={selectedOperator}
                onChange={changeOperator}
                labelId={operatorView.labelId}
                controlProps={getControlProps(operatorView)}
                isDisabled={isLocked}
                className={cn("cursor-pointer", operatorView.className)}
              />
            </FieldGroup>
            {isEditor && session.live !== null ? <StatusField edit={edit} idPrefix={idPrefix} /> : null}
            <BackhaulMediumField edit={edit} idPrefix={idPrefix} />
            {isEditor ? (
              <div className="flex h-8 items-center gap-2 pl-1">
                <Checkbox
                  {...editTargetProps(confirmedView.target)}
                  id={confirmedView.controlId}
                  checked={station.isConfirmed}
                  onCheckedChange={(checked) => dispatch({ type: "setStation", patch: { isConfirmed: checked === true } })}
                  disabled={isLocked}
                  className={isLocked ? undefined : "cursor-pointer"}
                />
                <Label htmlFor={confirmedView.controlId} className={isLocked ? undefined : "cursor-pointer"}>
                  {t("labels.confirmed")}
                </Label>
              </div>
            ) : null}
          </div>
          <BackhaulDetailFields edit={edit} idPrefix={idPrefix} />
        </div>
        <IdentifierRows edit={edit} stationId={stationId} idPrefix={idPrefix} />
        <FieldGroup view={notesView} label={t("labels.notes")}>
          <Textarea
            {...NO_AUTOFILL_PROPS}
            {...getControlProps(notesView)}
            value={station.notes}
            onChange={(event) => dispatch({ type: "setStation", patch: { notes: event.target.value } })}
            rows={isForm ? 2 : 3}
            placeholder={isForm ? t("placeholder.notes") : undefined}
            disabled={isLocked}
            className={notesView.className}
          />
        </FieldGroup>
      </div>
    </EditCard>
  );
}
