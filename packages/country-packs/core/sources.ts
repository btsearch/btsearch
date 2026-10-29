import type { Database } from "@openbts/drizzle/db";
import type { AuditEntity, AuditOperationKind } from "@openbts/shared/audit";

import type { OperatorRef } from "./conventions.ts";

export type LabelRat = "GSM" | "CDMA" | "UMTS" | "LTE" | "NR" | "IOT";
export type LabelVariant = "commercial" | "railway";
export type PermitLabel = { rat: LabelRat; mhz: number; variant: LabelVariant };
export type DecisionType = "permit" | "permit_change";
export type PermitStatus = "approved" | "in_service";
export type PermitKind = "permit" | "registration" | "inventory" | "environmental_permit" | "certificate" | "assessment" | "licence";
export type AntennaPlacement = "indoor" | "outdoor";

export const WHOLE_DATASET_SLICE = "";

export type ReleaseFile = { url: string; fileName: string };
export type Release = { coveredSlices: readonly string[]; files: readonly ReleaseFile[]; publishedOn: string | null };
export type LocalFile = ReleaseFile & { path: string };

export type ReadContext = {
  fetch: typeof fetch;
  signal: AbortSignal;
  now: Date;
  log: (message: string) => void;
  skip: (slice: string, reason: string) => void;
};

export type SiteSector = {
  azimuth: number | null;
  antennaHeight: number | null;
  antennaPlacement: AntennaPlacement | null;
};

export type SiteRecord = {
  slice: string;
  location: {
    longitude: number;
    latitude: number;
    city: string | null;
    address: string | null;
    regionIsoCode: string | null;
    ref?: string;
    precisionMeters?: number;
  };
  site: { siteId: string | null; licensee: string; name: string | null; ref?: string };
  permit: {
    label: PermitLabel | null;
    number: string | null;
    decisionType: DecisionType | null;
    expiresOn: string | null;
    status: PermitStatus | null;
  };
  sectors: readonly SiteSector[];
};

export type MicrowaveLinkEnd = {
  longitude: number;
  latitude: number;
  groundHeight: number | null;
  antennaHeight: number | null;
  city: string | null;
  province: string | null;
  street: string | null;
  locationDescription: string | null;
};

export type MicrowaveLinkEquipment = { type: string | null; manufacturer: string | null };

export type MicrowaveLinkTechnicalValues = {
  modulationType: string | null;
  bandwidth: string | null;
  txAntennaAttenuation: number | null;
  transmitter: MicrowaveLinkEquipment;
  txAntenna: MicrowaveLinkEquipment;
  txAntennaGain: number | null;
  rxAntenna: MicrowaveLinkEquipment;
  rxAntennaGain: number | null;
  rxNoiseFigure: number | null;
  rxAtpcAttenuation: number | null;
};

export type MicrowaveLinkRecord = {
  slice: string;
  licensee: string | null;
  permitNumber: string;
  decisionType: DecisionType | null;
  issuedOn: string | null;
  expiresOn: string | null;
  tx: MicrowaveLinkEnd;
  rx: MicrowaveLinkEnd;
  freqKhz: number;
  channelNumber: number | null;
  channelWidthMhz: number | null;
  polarization: string | null;
  planSymbol?: string | null;
  eirpDbm: number | null;
  technical: Partial<MicrowaveLinkTechnicalValues>;
  publishesEveryTechnicalColumn: boolean;
};

type DatasetReader<PublishedRecord> = {
  key: string;
  permitKind: PermitKind;
  checkEveryHours: number;
  discover(ctx: ReadContext): Promise<Release[]>;
  parse(ctx: ReadContext, release: Release, files: readonly LocalFile[]): AsyncIterable<PublishedRecord>;
};

export type SourceTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type PublishedSiteName = { operatorId: number; siteId: string; name: string };
export type SourceAuditEntry = {
  entity: AuditEntity;
  op: "create" | "update";
  recordId: number;
  stationId: number | null;
  old?: unknown;
  new: unknown;
};
export type SourceAudit = (
  operation: { kind: AuditOperationKind; metadata: Record<string, unknown> },
  entries: readonly SourceAuditEntry[],
) => Promise<void>;
export type SiteNameSyncContext = { tx: SourceTransaction; siteNames: readonly PublishedSiteName[]; audit: SourceAudit };
export type SiteNameSyncResult = { skippedSiteNames: number };
export type KmzExportContext = {
  db: Database | SourceTransaction;
  sourceId: number;
  directory: string;
  day: string;
  changedDatasets: readonly string[];
};
export type UnmatchedLteCell = { operator: OperatorRef; operatorIds: readonly number[]; enbid: number };
export type CellMatchContext = { db: Database | SourceTransaction; cells: readonly UnmatchedLteCell[] };

export type SitesDataset = DatasetReader<SiteRecord> & {
  layer: "sites";
  yieldsSitePlacementTo?: readonly string[];
  syncSiteNames?: (ctx: SiteNameSyncContext) => Promise<SiteNameSyncResult>;
};
export type MicrowaveLinksDataset = DatasetReader<MicrowaveLinkRecord> & { layer: "microwave_links" };
export type DatasetDefinition = SitesDataset | MicrowaveLinksDataset;

export type OfficialSourceDefinition = {
  key: string;
  countryCode: string;
  shortName: string;
  authority: string;
  homepageUrl: string;
  licence: string;
  attribution: string;
  isRedistributable: boolean;
  reportsPermitStatus?: boolean;
  shortLicenseeName: (publishedName: string) => string;
  operatorNameOfLicensee: (publishedName: string) => string | null;
  datasets: readonly DatasetDefinition[];
  exportKmz?: (ctx: KmzExportContext) => Promise<string[]>;
  findOfficialSiteIdsForCells?: (ctx: CellMatchContext) => Promise<number[][]>;
};
