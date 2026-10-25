import type { ObservationFlagKind } from "@openbts/shared/contract";

import type { MatchedField } from "../cells/identity.js";

export type FlagKey = { kind: ObservationFlagKind; subjectKey: string };
export type ObservedCellIdentity = { plmn: string; rat: string; cellKey: number };
export type ObservedSiteIdentity = { plmn: string; rat: string | null; nodeId: number | null; stationId: number | null };
export type QuirkGroup = "readerVersion" | "deviceModel";

export function cellSubject(cellId: number): string {
  return `cell:${cellId}`;
}

export function cellFieldSubject(cellId: number, field: MatchedField): string {
  return `cell:${cellId}:${field}`;
}

export function cellNetworkSubject(cellId: number, plmn: string): string {
  return `cell:${cellId}:${plmn}`;
}

export function sectorSubject(sectorId: number): string {
  return `sector:${sectorId}`;
}

export function stationSubject(stationId: number): string {
  return `station:${stationId}`;
}

export function observedCellSubject({ plmn, rat, cellKey }: ObservedCellIdentity): string {
  return `observedCell:${plmn}:${rat}:${cellKey}`;
}

export function observedSiteSubject({ plmn, rat, nodeId, stationId }: ObservedSiteIdentity): string {
  return stationId === null ? `observedSite:${plmn}:${rat}:${nodeId}` : `observedSite:${plmn}:station:${stationId}`;
}

export function countryBandSubject(countryCode: string, bandId: number): string {
  return `country:${countryCode}:band:${bandId}`;
}

export function networkSubject(plmn: string): string {
  return `plmn:${plmn}`;
}

export function readerQuirkSubject(group: QuirkGroup, groupId: number, field: MatchedField, pattern: string, parameter: number): string {
  return `${group}:${groupId}:${field}:${pattern}:${parameter}`;
}

export function deviceSubject(deviceId: string): string {
  return `device:${deviceId}`;
}

export function userSubject(userId: string): string {
  return `user:${userId}`;
}
