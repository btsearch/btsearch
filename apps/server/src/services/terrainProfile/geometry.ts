import { calculateP1812Detailed } from "@btsearch/rf-engine/p1812";
import { EARTH_RADIUS_M, calculateBearing, calculateDistance } from "@openbts/shared/radiolinesUtils";
import { circularAzimuthDeltaDeg } from "@openbts/shared/terrainProfile";

const DEFAULT_EFFECTIVE_EARTH_RADIUS_FACTOR = 4 / 3;
const CLEARANCE_EPSILON_M = 1e-9;
export const MAX_TERRAIN_PROFILE_SAMPLES = 20_000;
const DEFAULT_DN = 45;
const DEFAULT_N0 = 325;

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type TerrainProfileEndpoint = GeoPoint & {
  antennaHeightAglM: number;
};

export type TerrainProfileSample = {
  distanceM: number;
  terrainElevationM: number;
  surfaceElevationM: number;
  latitude?: number;
  longitude?: number;
};

export type AnalyzedTerrainProfileSample = TerrainProfileSample & {
  earthBulgeM: number;
  lineOfSightElevationM: number;
  terrainClearanceM: number;
  surfaceClearanceM: number;
};

export type TerrainProfileAnalysisInput = {
  transmitter: TerrainProfileEndpoint;
  receiver: TerrainProfileEndpoint;
  frequencyMHz: number;
  samples: readonly TerrainProfileSample[];
  sectorAzimuthDegrees?: number | null;
  effectiveEarthRadiusFactor?: number;
  dn?: number;
  n0?: number;
};

export type P1812Diagnostics = {
  pathType: "los" | "transhorizon";
  basicTransmissionLossDb: number;
  fieldStrengthDbuvm: number;
  freeSpaceLossDb: number;
  diffractionLossDb: number;
  troposcatterLossDb: number;
  anomalousLossDb: number;
  txHorizonDistanceKm: number;
  rxHorizonDistanceKm: number;
  effectiveEarthRadiusKm: number;
  beta0: number;
  seaFraction: number;
  bullingtonDistanceKm: number | null;
};

export type TerrainProfileAnalysisResult = {
  status: "clear" | "constrained" | "blocked";
  distanceM: number;
  geodesicDistanceM: number;
  bearingDegrees: number;
  sectorAzimuthDegrees: number | null;
  azimuthDeltaDegrees: number | null;
  transmitterAntennaElevationM: number;
  receiverAntennaElevationM: number;
  lineOfSight: {
    terrain: boolean;
    surface: boolean;
  };
  clearance: {
    minimumTerrainM: number;
    minimumSurfaceM: number;
  };
  p1812: P1812Diagnostics;
  samples: AnalyzedTerrainProfileSample[];
  metadata: {
    model: "itu-r-p1812-8";
    version: 1;
    earthRadiusM: number;
    effectiveEarthRadiusFactor: number;
    frequencyMHz: number;
    dn: number;
    n0: number;
    sourceSampleCount: number;
    returnedSampleCount: number;
    maxReturnedSamples: number;
    aggregated: boolean;
  };
};

function calculateEarthBulgeM(distanceM: number, totalDistanceM: number, effectiveEarthRadiusM: number): number {
  return (distanceM * (totalDistanceM - distanceM)) / (2 * effectiveEarthRadiusM);
}

function calculateLineOfSightElevationM(distanceM: number, totalDistanceM: number, txElevationM: number, rxElevationM: number): number {
  return txElevationM + (distanceM / totalDistanceM) * (rxElevationM - txElevationM);
}

function effectiveSurfaceElevationM(sample: TerrainProfileSample): number {
  return Math.max(sample.terrainElevationM, sample.surfaceElevationM);
}

export function aggregateProfileSamples<T extends TerrainProfileSample>(
  samples: readonly T[],
  maxSamples = MAX_TERRAIN_PROFILE_SAMPLES,
  selectionScore: (sample: T) => number = (sample) => effectiveSurfaceElevationM(sample),
): T[] {
  if (samples.length <= maxSamples) return [...samples];

  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) return [];

  const interiorCount = samples.length - 2;
  const bucketCount = maxSamples - 2;
  const aggregated: T[] = [first];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startIndex = 1 + Math.floor((bucketIndex * interiorCount) / bucketCount);
    const endIndex = 1 + Math.floor(((bucketIndex + 1) * interiorCount) / bucketCount);
    let selected = samples[startIndex];
    if (selected === undefined) continue;
    let selectedScore = selectionScore(selected);

    for (let sampleIndex = startIndex + 1; sampleIndex < endIndex; sampleIndex += 1) {
      const candidate = samples[sampleIndex];
      if (candidate === undefined) continue;
      const candidateScore = selectionScore(candidate);
      if (candidateScore <= selectedScore) continue;
      selected = candidate;
      selectedScore = candidateScore;
    }

    aggregated.push(selected);
  }

  aggregated.push(last);
  return aggregated;
}

export function analyzeTerrainProfile(input: TerrainProfileAnalysisInput): TerrainProfileAnalysisResult {
  if (input.samples.length < 5) throw new RangeError("profile must have at least 5 samples for P.1812");

  const effectiveEarthRadiusFactor = input.effectiveEarthRadiusFactor ?? DEFAULT_EFFECTIVE_EARTH_RADIUS_FACTOR;
  const sectorAzimuthDegrees = input.sectorAzimuthDegrees ?? null;
  const dn = input.dn ?? DEFAULT_DN;
  const n0 = input.n0 ?? DEFAULT_N0;

  const totalDistanceM = input.samples.at(-1)?.distanceM ?? 0;
  const transmitterGroundElevationM = input.samples[0]?.terrainElevationM ?? 0;
  const receiverGroundElevationM = input.samples.at(-1)?.terrainElevationM ?? 0;
  const transmitterAntennaElevationM = transmitterGroundElevationM + input.transmitter.antennaHeightAglM;
  const receiverAntennaElevationM = receiverGroundElevationM + input.receiver.antennaHeightAglM;
  const effectiveEarthRadiusM = EARTH_RADIUS_M * effectiveEarthRadiusFactor;

  const distanceKm = input.samples.map((s) => s.distanceM / 1000);
  const terrainM = input.samples.map((s) => s.terrainElevationM);
  const surfaceM = input.samples.map((s) => s.surfaceElevationM);
  const zone = input.samples.map(() => 4);

  const p1812Result = calculateP1812Detailed(
    { distanceKm, terrainM, surfaceM, zone },
    {
      frequencyGhz: input.frequencyMHz / 1000,
      txHeightM: input.transmitter.antennaHeightAglM,
      rxHeightM: input.receiver.antennaHeightAglM,
      timePercent: 50,
      txLat: input.transmitter.latitude,
      txLon: input.transmitter.longitude,
      rxLat: input.receiver.latitude,
      rxLon: input.receiver.longitude,
      dn,
      n0,
    },
  );

  const allAnalyzedSamples = input.samples.map<AnalyzedTerrainProfileSample>((sample) => {
    const earthBulgeM = calculateEarthBulgeM(sample.distanceM, totalDistanceM, effectiveEarthRadiusM);
    const lineOfSightElevationM = calculateLineOfSightElevationM(
      sample.distanceM,
      totalDistanceM,
      transmitterAntennaElevationM,
      receiverAntennaElevationM,
    );
    const terrainClearanceM = lineOfSightElevationM - sample.terrainElevationM - earthBulgeM;
    const surfaceClearanceM = lineOfSightElevationM - effectiveSurfaceElevationM(sample) - earthBulgeM;
    return {
      ...sample,
      earthBulgeM,
      lineOfSightElevationM,
      terrainClearanceM,
      surfaceClearanceM,
    };
  });

  let minimumTerrainClearance = Infinity;
  let minimumSurfaceClearance = Infinity;
  for (const sample of allAnalyzedSamples) {
    if (sample.terrainClearanceM < minimumTerrainClearance) minimumTerrainClearance = sample.terrainClearanceM;
    if (sample.surfaceClearanceM < minimumSurfaceClearance) minimumSurfaceClearance = sample.surfaceClearanceM;
  }

  const terrainLineOfSight = minimumTerrainClearance >= -CLEARANCE_EPSILON_M;
  const surfaceLineOfSight = minimumSurfaceClearance >= -CLEARANCE_EPSILON_M;

  let status: TerrainProfileAnalysisResult["status"] = "clear";
  if (!surfaceLineOfSight || p1812Result.pathType === "transhorizon") status = "blocked";
  else if (!terrainLineOfSight) status = "constrained";

  const samples = aggregateProfileSamples(allAnalyzedSamples, MAX_TERRAIN_PROFILE_SAMPLES, (sample) => -sample.surfaceClearanceM);

  const geodesicDistanceM = calculateDistance(
    input.transmitter.latitude,
    input.transmitter.longitude,
    input.receiver.latitude,
    input.receiver.longitude,
  );
  const bearingDegrees = calculateBearing(input.transmitter.latitude, input.transmitter.longitude, input.receiver.latitude, input.receiver.longitude);
  const azimuthDeltaDegrees =
    sectorAzimuthDegrees === null || sectorAzimuthDegrees === 360 ? null : circularAzimuthDeltaDeg(bearingDegrees, sectorAzimuthDegrees);

  return {
    status,
    distanceM: totalDistanceM,
    geodesicDistanceM,
    bearingDegrees,
    sectorAzimuthDegrees,
    azimuthDeltaDegrees,
    transmitterAntennaElevationM,
    receiverAntennaElevationM,
    lineOfSight: {
      terrain: terrainLineOfSight,
      surface: surfaceLineOfSight,
    },
    clearance: {
      minimumTerrainM: minimumTerrainClearance,
      minimumSurfaceM: minimumSurfaceClearance,
    },
    p1812: {
      pathType: p1812Result.pathType,
      basicTransmissionLossDb: p1812Result.basicTransmissionLossDb,
      fieldStrengthDbuvm: p1812Result.fieldStrengthDbuvm,
      freeSpaceLossDb: p1812Result.freeSpaceLossDb,
      diffractionLossDb: p1812Result.diffractionLossDb,
      troposcatterLossDb: p1812Result.troposcatterLossDb,
      anomalousLossDb: p1812Result.anomalousLossDb,
      txHorizonDistanceKm: p1812Result.txHorizonDistanceKm,
      rxHorizonDistanceKm: p1812Result.rxHorizonDistanceKm,
      effectiveEarthRadiusKm: p1812Result.effectiveEarthRadiusKm,
      beta0: p1812Result.beta0,
      seaFraction: p1812Result.seaFraction,
      bullingtonDistanceKm: p1812Result.bullingtonDistanceKm ?? null,
    },
    samples,
    metadata: {
      model: "itu-r-p1812-8",
      version: 1,
      earthRadiusM: EARTH_RADIUS_M,
      effectiveEarthRadiusFactor,
      frequencyMHz: input.frequencyMHz,
      dn,
      n0,
      sourceSampleCount: input.samples.length,
      returnedSampleCount: samples.length,
      maxReturnedSamples: MAX_TERRAIN_PROFILE_SAMPLES,
      aggregated: samples.length < input.samples.length,
    },
  };
}
