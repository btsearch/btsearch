import { useQuery } from "@tanstack/react-query";

import type { Country, Me, StationRecord } from "./types";
import { getStationCountryCode } from "./utils/stations";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { canEditPlace, getEditorArea, getStationEditPlace } from "@/features/stations/list/data/editorArea";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { useEditorMe } from "@/lib/auth/me";

export type StationEditTarget = "editor" | "submission";

type EditableStation = Pick<StationRecord, "operator" | "location">;

function canEditStation(me: Me, station: EditableStation): boolean {
  return canEditPlace(getEditorArea(me), getStationEditPlace(station));
}

function acceptsContributions(countryCode: string, countries: readonly Country[]): boolean {
  return countries.some((country) => country.code === countryCode && country.contributions === "open");
}

export function useStationEditTarget(station: StationRecord | undefined): StationEditTarget | null {
  const { data: session, isPending: isSessionPending } = useSettledSession();
  const { data: settings } = useSettings();
  const role = session?.user?.role;
  const isAdmin = role === "admin";
  const isEditor = role === "editor";
  const couldTakeProposal = settings?.features.submissions === true && station?.status !== "inactive";
  const { data: me, isPending: isMePending } = useEditorMe(session?.user?.id, isEditor);
  const { data: countries } = useQuery({ ...countriesQueryOptions(), enabled: couldTakeProposal && !isSessionPending && !isAdmin });

  if (station === undefined || isSessionPending) return null;
  if (isAdmin) return "editor";
  if (isEditor && isMePending) return null;
  if (isEditor && me !== undefined && canEditStation(me, station)) return "editor";
  if (!couldTakeProposal) return null;

  const countryCode = getStationCountryCode(station);
  if (countryCode === null) return "submission";
  if (countries === undefined) return null;
  return acceptsContributions(countryCode, countries) ? "submission" : null;
}
