export type GeoBox = { south: number; north: number; west: number; east: number };

export type TerrainProfilesCapability = { receiverBounds: GeoBox };

export type PackCapabilities = {
  emf?: boolean;
  terrainProfiles?: TerrainProfilesCapability;
  kmz?: boolean;
  cellNetworks?: boolean;
};

export type SourceCapabilities = {
  official: boolean;
  microwaveLinks: boolean;
};

export type CountryCapabilities = SourceCapabilities & {
  emf: boolean;
  terrainProfiles: TerrainProfilesCapability | null;
  kmz: boolean;
  cellNetworks: boolean;
};

export type PackCapabilityName = "emf" | "terrainProfiles";

export const NO_SOURCE_CAPABILITIES: SourceCapabilities = { official: false, microwaveLinks: false };

export function resolveCapabilities(declared: PackCapabilities, sources: SourceCapabilities): CountryCapabilities {
  return {
    official: sources.official,
    microwaveLinks: sources.microwaveLinks,
    emf: declared.emf ?? false,
    terrainProfiles: declared.terrainProfiles ?? null,
    kmz: sources.official && (declared.kmz ?? false),
    cellNetworks: declared.cellNetworks ?? true,
  };
}
