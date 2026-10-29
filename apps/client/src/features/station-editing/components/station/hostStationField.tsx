import type { Brand, Operator } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { findSiteStation, hostsOtherStations, listHostCandidates } from "../../model/hostStations";
import type { SiteStation } from "../../model/types";
import { FieldGroup, getControlProps, getStationFieldView } from "./stationFields";
import { BrandMark } from "@/components/cellular/brandMark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getStationNumber } from "@/features/station-details/station/utils/stations";
import { cn } from "@/lib/utils";

type HostStationFieldProps = {
  edit: StationDraftApi;
  idPrefix: string;
};

type HostLabelProps = {
  station: SiteStation;
  operatorsById: ReadonlyMap<number, Operator>;
  brands: readonly Brand[];
};

const NO_HOST = "none";

function HostLabel({ station, operatorsById, brands }: HostLabelProps) {
  const { t } = useTranslation("main");
  const operator = station.operatorId === null ? null : (operatorsById.get(station.operatorId) ?? null);

  return (
    <>
      <BrandMark brand={getOperatorBrand(operator, brands)} size={16} />
      <span className="truncate">{operator?.name ?? t("unknownOperator")}</span>
      <span className="shrink-0 font-mono">{getStationNumber(station) || `#${station.id}`}</span>
    </>
  );
}

export function HostStationField({ edit, idPrefix }: HostStationFieldProps) {
  const { t } = useTranslation(["common", "stations"]);
  const { session, dispatch, lookups, hostSite } = edit;
  const { hostStationId, operatorId } = session.draft.station;
  const view = getStationFieldView(edit, "hostStationId", idPrefix);
  const candidates = listHostCandidates(session, hostSite);
  const host = findSiteStation(hostSite, hostStationId);
  const hasChoice = candidates.length > 0 || hostStationId !== null;
  const hostsOthers = hostSite !== null && hostsOtherStations(hostSite, operatorId);
  const noHostText = t("stations:edit.stationCard.noHost");

  function changeHost(value: string | null) {
    const candidate = candidates.find((station) => String(station.id) === value);
    dispatch({ type: "setHostStation", hostStationId: candidate?.id ?? null });
  }

  return (
    <FieldGroup view={view} label={t("labels.hostStation")} isLabelLinked={false}>
      <Select value={hostStationId === null ? NO_HOST : String(hostStationId)} onValueChange={changeHost} disabled={!edit.canEdit || !hasChoice}>
        <SelectTrigger {...getControlProps(view)} aria-labelledby={view.labelId} className={cn("cursor-pointer", view.className)}>
          <SelectValue>
            {hostStationId === null ? noHostText : null}
            {hostStationId !== null && host === null ? <span className="font-mono">{`#${hostStationId}`}</span> : null}
            {host === null ? null : <HostLabel station={host} operatorsById={lookups.operatorsById} brands={lookups.brands} />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-56">
          <SelectItem value={NO_HOST} className="cursor-pointer">
            {noHostText}
          </SelectItem>
          {candidates.map((station) => (
            <SelectItem key={station.id} value={String(station.id)} className="cursor-pointer">
              <HostLabel station={station} operatorsById={lookups.operatorsById} brands={lookups.brands} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hostsOthers ? <p className="-mt-1 max-w-48 text-xs text-muted-foreground">{t("stations:edit.stationCard.hostsOthers")}</p> : null}
    </FieldGroup>
  );
}
