import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";

import { type EditLookups, useCountryLookups, useEditReference } from "../data/lookups";
import {
  type ChangeContext,
  type Translate,
  countCells,
  findStationLocationId,
  formatTextPart,
  formatTextParts,
  listChanges,
} from "../model/changes";
import {
  type DraftAction,
  type DraftDispatch,
  type SessionInput,
  createSession,
  draftReducer,
  findTacRuleChange,
  withNewKey,
} from "../model/draftReducer";
import { findSiteStation } from "../model/hostStations";
import { findDraftCountryCode } from "../model/snapshots";
import type { ChangeItem, EditError, EditSession, HostSite, Rat, RatCounters, TextPart } from "../model/types";
import { getOperatorGnbidLength, listShownErrors, validateDraft } from "../model/validate";
import { indexNetworkNames } from "@/features/shared/operatorMarks";
import { locationRecordQueryOptions } from "@/features/station-details/station/api";
import { getBandCode, getBandLabel } from "@/features/station-details/station/utils/bands";
import { getOperatorShortLabel, getStationNumber } from "@/features/station-details/station/utils/stations";

type StationDraftInput = SessionInput & {
  stationId: number | null;
  canEdit: boolean;
};

export type StationDraftApi = {
  session: EditSession;
  dispatch: DraftDispatch;
  changes: ChangeItem[];
  corrections: ChangeItem[];
  errors: EditError[];
  hasErrors: boolean;
  counters: Record<Rat, RatCounters>;
  canEdit: boolean;
  lookups: EditLookups;
  hostSite: HostSite | null;
  context: ChangeContext;
  setServerErrors: (errors: readonly EditError[]) => void;
};

export type EditText = {
  formatPart: (part: TextPart | null) => string;
  formatParts: (parts: readonly TextPart[]) => string;
  formatError: (error: EditError) => string;
};

type BlockedSaves = {
  blockedSaves: number;
  countBlockedSave: () => void;
  reportBlockedSave: () => void;
};

export function pickFreshData<Data>(data: Data | undefined, dataUpdatedAt: number, openedAt: number): Data | null {
  return data !== undefined && dataUpdatedAt >= openedAt ? data : null;
}

export function useEditText(): EditText {
  const { t } = useTranslation();
  const translate: Translate = (key, values) => t(key, values);

  return {
    formatPart: (part) => formatTextPart(part, translate),
    formatParts: (parts) => formatTextParts(parts, translate),
    formatError: (error) => translate(error.messageKey, error.values),
  };
}

export function useBlockedSaves(dispatch: DraftDispatch): BlockedSaves {
  const [blockedSaves, setBlockedSaves] = useState(0);

  function countBlockedSave() {
    setBlockedSaves((count) => count + 1);
  }

  function reportBlockedSave() {
    dispatch({ type: "attemptSave" });
    countBlockedSave();
  }

  return { blockedSaves, countBlockedSave, reportBlockedSave };
}

function createChangeContext(lookups: EditLookups, hostSite: HostSite | null, unknownBandText: string, language: string): ChangeContext {
  const networkNames = indexNetworkNames(lookups.operators);

  return {
    bandText: (bandId) => {
      const band = bandId === null ? undefined : lookups.bandsById.get(bandId);
      const label = getBandLabel(band, language);
      const code = getBandCode(band);
      if (label === null) return unknownBandText;
      return code === null ? label : `${label} ${code}`;
    },
    operatorName: (operatorId) => (operatorId === null ? null : (lookups.operatorsById.get(operatorId)?.name ?? null)),
    operatorShortName: (operatorId) => getOperatorShortLabel(operatorId === null ? null : (lookups.operatorsById.get(operatorId) ?? null)),
    stationCode: (stationId) => {
      const station = findSiteStation(hostSite, stationId);
      return station === null ? null : getStationNumber(station) || null;
    },
    regionName: (regionId) => (regionId === null ? null : (lookups.regionsById.get(regionId)?.name ?? null)),
    ownerName: (ownerId) => lookups.ownersById.get(ownerId)?.name ?? null,
    ownerPlmn: (operatorId) => (operatorId === null ? null : (lookups.operatorsById.get(operatorId)?.primaryPlmn ?? null)),
    gnbidLength: (operatorId) =>
      getOperatorGnbidLength(operatorId === null ? null : (lookups.operatorsById.get(operatorId) ?? null), lookups.operatorsById),
    networkName: (code) => networkNames.get(code) ?? code,
  };
}

export function useStationDraft(input: StationDraftInput): StationDraftApi {
  const [session, send] = useReducer(draftReducer, input, createSession);
  const { t, i18n } = useTranslation();
  const reference = useEditReference();
  const featureCountryCode = findDraftCountryCode(session.draft, reference.operatorsById, reference.regionsById, null);
  const countryCode = featureCountryCode ?? session.countryCode;
  const tacRuleChange = findTacRuleChange(session, countryCode);
  if (tacRuleChange !== null) send({ type: "setHoistedTac", hoistedTac: tacRuleChange });
  const editsHostStations = countryCode !== null && reference.countriesByCode.get(countryCode)?.capabilities.editableHostStations === true;
  if (editsHostStations !== session.editsHostStations) send({ type: "setHostStationEditing", editsHostStations });
  const lookups = useCountryLookups(reference, countryCode, featureCountryCode);
  const { language } = i18n;
  const { stationId, canEdit } = input;
  const { data: hostLocation } = useQuery(locationRecordQueryOptions(findStationLocationId(session)));
  const hostSite = useMemo(
    () => (hostLocation === undefined ? null : { stationId, stations: hostLocation.stations.filter((station) => station.id !== stationId) }),
    [hostLocation, stationId],
  );
  const context = useMemo(() => createChangeContext(lookups, hostSite, t("stations:cells.unknownBand"), language), [lookups, hostSite, t, language]);
  const dispatch = useCallback((action: DraftAction) => send(withNewKey(action)), []);
  const setServerErrors = useCallback((errors: readonly EditError[]) => send({ type: "setServerErrors", errors }), []);

  return useMemo(() => {
    const { changes, corrections } = listChanges(session, context);
    const blockingErrors = validateDraft(session, lookups, hostSite);
    const errors = [...listShownErrors(blockingErrors, session.isSaveAttempted), ...session.serverErrors];

    return {
      session,
      dispatch,
      changes,
      corrections,
      errors,
      hasErrors: blockingErrors.length > 0,
      counters: countCells(session, context.gnbidLength(session.draft.station.operatorId)),
      canEdit,
      lookups,
      hostSite,
      context,
      setServerErrors,
    };
  }, [session, lookups, hostSite, context, canEdit, dispatch, setServerErrors]);
}
