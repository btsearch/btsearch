import type { CellNetworkMatch } from "@openbts/shared/contract";
import { plmnCandidates } from "@openbts/shared/operatorUtils";

import { cellNetworkCodes } from "../../../cells/networks.js";
import { EXTRA_CODE_LIMITS, type KnownPlmns } from "../../../cells/networkWrites.js";
import { CONFIRMING_PEOPLE } from "../../cells/confirmation.js";
import type { RaisedFlag } from "../kinds.js";
import { cellNetworkSubject } from "../subjects.js";
import { type Sighting, type SightingSum, isConfirmedSince, sumSightings } from "./sightings.js";

export type NetworkedCell = {
  id: number;
  stationId: number;
  rat: string;
  ownerCode: string | undefined;
  extraCodes: readonly string[];
  countryCode: string | null;
};
export type MatchedObservedCell = {
  cellId: number;
  observedCellId: number;
  observedSiteId: number | null;
  plmn: string;
  networkMatch: CellNetworkMatch;
  samples: number;
  people: number;
  lastSeenOn: string | null;
};
export type ListedNetworkRow = Sighting & { cellId: number; plmn: string; ownPlmn: string; networkMatch: CellNetworkMatch };
export type NetworkFlagInput = {
  cells: readonly NetworkedCell[];
  observedCells: readonly MatchedObservedCell[];
  listedNetworks: readonly ListedNetworkRow[];
  known: KnownPlmns;
  seenSince: string;
};

type NetworkFlag = RaisedFlag<"networkMissing" | "networkNotSeen">;
type NetworkSighting = { code: string; seenAs: "list" | "missingCode"; seen: SightingSum };

function isCode(observedCode: string, code: string): boolean {
  return plmnCandidates(observedCode).includes(code);
}

export function knownCode(observedCode: string, known: KnownPlmns): string | undefined {
  return plmnCandidates(observedCode).find((candidate) => known.has(candidate));
}

export function isSameCountry(code: string, countryCode: string | null, known: KnownPlmns): boolean {
  return countryCode === null || known.get(code)?.countryCode === countryCode;
}

function missingCodeSightings(observed: readonly MatchedObservedCell[], seenSince: string): NetworkSighting[] {
  return observed.flatMap(({ plmn, networkMatch, samples, people, lastSeenOn, observedCellId, observedSiteId }) => {
    if (networkMatch !== "missingCode" || people < CONFIRMING_PEOPLE || lastSeenOn === null || lastSeenOn < seenSince) return [];
    return [{ code: plmn, seenAs: "missingCode" as const, seen: { samples, people, lastSeenOn, observedCellId, observedSiteId } }];
  });
}

export function confirmedListings(listed: readonly (Sighting & { plmn: string })[], seenSince: string): NetworkSighting[] {
  return [...Map.groupBy(listed, (row) => row.plmn)].flatMap(([code, rows]) => {
    const seen = sumSightings(rows);
    return isConfirmedSince(seen, seenSince) ? [{ code, seenAs: "list" as const, seen }] : [];
  });
}

function missingNetworks(
  cell: NetworkedCell,
  observed: readonly MatchedObservedCell[],
  listed: readonly ListedNetworkRow[],
  input: NetworkFlagInput,
): NetworkSighting[] {
  const broadcast = new Set(cellNetworkCodes(cell.ownerCode, cell.extraCodes));
  const byNetwork = new Map<string, NetworkSighting>();
  for (const { code, seenAs, seen } of [...confirmedListings(listed, input.seenSince), ...missingCodeSightings(observed, input.seenSince)]) {
    const network = knownCode(code, input.known);
    if (network === undefined || broadcast.has(network) || !isSameCountry(network, cell.countryCode, input.known)) continue;
    const kept = byNetwork.get(network);
    if (kept === undefined || seen.samples > kept.seen.samples) byNetwork.set(network, { code: network, seenAs, seen });
  }
  return [...byNetwork.values()];
}

function unseenNetworks(cell: NetworkedCell, observed: readonly MatchedObservedCell[], listed: readonly ListedNetworkRow[], seenSince: string) {
  const ownLists = listed.filter((row) => row.plmn === row.ownPlmn);
  if (ownLists.length === 0) return [];
  const lists = sumSightings(ownLists);
  if (!isConfirmedSince(lists, seenSince)) return [];

  return cell.extraCodes.flatMap((network) => {
    if (network === cell.ownerCode) return [];
    const lastListedOn = listed
      .filter((row) => isCode(row.plmn, network))
      .reduce<string | null>((latest, row) => (latest === null || row.lastSeenOn > latest ? row.lastSeenOn : latest), null);
    const isSeenUnder = observed.some(({ plmn, lastSeenOn }) => isCode(plmn, network) && lastSeenOn !== null && lastSeenOn >= seenSince);
    if ((lastListedOn !== null && lastListedOn >= seenSince) || isSeenUnder) return [];
    return [{ network, lastListedOn, lists, kept: cell.extraCodes.filter((code) => code !== network) }];
  });
}

export function raiseNetworkFlags(input: NetworkFlagInput): NetworkFlag[] {
  const observedByCell = Map.groupBy(
    input.observedCells.filter(({ networkMatch }) => networkMatch !== "partner"),
    (row) => row.cellId,
  );
  const listedByCell = Map.groupBy(
    input.listedNetworks.filter(({ networkMatch }) => networkMatch !== "partner"),
    (row) => row.cellId,
  );

  return input.cells.flatMap((cell): NetworkFlag[] => {
    const limit = EXTRA_CODE_LIMITS[cell.rat] ?? 0;
    if (limit === 0) return [];
    const observed = observedByCell.get(cell.id) ?? [];
    const listed = listedByCell.get(cell.id) ?? [];
    const flagOf = (network: string, seen: Pick<SightingSum, "observedCellId" | "observedSiteId" | "people">, plmns: string[]) => ({
      subjectKey: cellNetworkSubject(cell.id, network),
      refs: { stationId: cell.stationId, cellId: cell.id, observedCellId: seen.observedCellId, observedSiteId: seen.observedSiteId },
      suggestion: { cells: [{ action: "update" as const, id: cell.id, plmns }] },
      measure: { people: seen.people },
    });

    const missing = cell.extraCodes.length < limit ? missingNetworks(cell, observed, listed, input) : [];
    const unseen = unseenNetworks(cell, observed, listed, input.seenSince);
    return [
      ...missing.map(({ code: network, seenAs, seen }) => ({
        kind: "networkMissing" as const,
        ...flagOf(network, seen, cellNetworkCodes(cell.ownerCode, [...cell.extraCodes, network].toSorted())),
        evidence: { network, seenAs, samples: seen.samples, people: seen.people, lastSeenOn: seen.lastSeenOn },
      })),
      ...unseen.map(({ network, lastListedOn, lists, kept }) => ({
        kind: "networkNotSeen" as const,
        ...flagOf(network, lists, cellNetworkCodes(cell.ownerCode, kept)),
        evidence: { network, readingsWithList: lists.samples, people: lists.people, lastListedOn },
      })),
    ];
  });
}
