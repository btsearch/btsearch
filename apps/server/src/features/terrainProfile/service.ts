import { getSI2PEMAntennaCandidates } from "./si2pem.adapter.js";
import { type ResolvedStationWithFallbacks, resolveNetWorksSharingSibling } from "./stationResolver.js";
import type { AntennaCandidate, SI2PEMReport, TerrainWarningCode } from "./types.js";

type AntennaDataLookup = {
  report: SI2PEMReport | null;
  candidates: AntennaCandidate[];
  warningCodes: TerrainWarningCode[];
};

export async function lookupAntennaData(resolved: ResolvedStationWithFallbacks): Promise<AntennaDataLookup> {
  const si2pem = await getSI2PEMAntennaCandidates(resolved.station, resolved.ukeCandidates).catch(() => ({
    report: null,
    candidates: [],
    warningCodes: ["SI2PEM_REPORT_UNAVAILABLE" as const],
  }));
  const warningCodes: TerrainWarningCode[] = [...si2pem.warningCodes];
  const candidates = si2pem.candidates.length ? si2pem.candidates : resolved.ukeCandidates;
  if (!si2pem.candidates.length && resolved.ukeCandidates.length) warningCodes.push("UKE_ANTENNA_FALLBACK");
  return { report: si2pem.report, candidates, warningCodes };
}

export async function lookupSiblingAntennaData(resolved: ResolvedStationWithFallbacks): Promise<AntennaDataLookup | null> {
  const sibling = await resolveNetWorksSharingSibling(resolved).catch(() => null);
  if (!sibling) return null;
  const siblingData = await lookupAntennaData(sibling);
  if (!siblingData.candidates.length) return null;
  return { ...siblingData, warningCodes: [...siblingData.warningCodes, "NETWORKS_SHARING_DATA"] };
}
