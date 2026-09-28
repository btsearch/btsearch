import type { AntennaCandidate } from "./types.js";

export function resolveAntennaMainBeam(candidate: Pick<AntennaCandidate, "source" | "measuredTilt">) {
  if (candidate.source !== "si2pem_report" || candidate.measuredTilt === null)
    return { basis: "unavailable", mainBeamElevationDegrees: null } as const;

  return {
    basis: "si2pem_measured_resultant_tilt",
    mainBeamElevationDegrees: -candidate.measuredTilt,
  } as const;
}
