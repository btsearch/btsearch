export type Band = {
  id: number;
  value: number;
  rat: string;
  name: string;
  duplex: string | null;
  variant: string | null;
};

export type Region = {
  id: number;
  name: string;
  code: string;
};

export type Location = {
  id: number;
  city: string;
  address: string;
  longitude: number;
  latitude: number;
  updatedAt: string;
  createdAt: string;
  region: Region;
};

export type Operator = {
  id: number;
  name: string;
  full_name: string;
  parent_id: number | null;
  mnc: number;
};

export type CellDetails = {
  // GSM
  lac?: number;
  cid?: number;
  e_gsm?: boolean;
  // UMTS
  rnc?: number;
  cid_long?: number;
  arfcn?: number;
  // LTE
  tac?: number;
  enbid?: number;
  clid?: number;
  ecid?: number;
  earfcn?: number;
  supports_iot?: boolean;
  // NR
  type?: "nsa" | "sa";
  gnbid?: number;
  nci?: number;
  nrtac?: number;
  pci?: number;
  supports_nr_redcap?: boolean;
} | null;

export type CellType = "MACROCELL" | "MICROCELL" | "PICOCELL" | "FEMTOCELL" | "SMALLCELL";

export type Cell = {
  id: number;
  rat: string;
  station_id: number;
  type: CellType | null;
  notes: string | null;
  sector_id: number | null;
  is_confirmed: boolean;
  updatedAt: string;
  createdAt: string;
  band: Band;
  details: CellDetails;
};

export type ExtraIdentificator = {
  id: number;
  station_id: number;
  networks_id: number | null;
  networks_name: string | null;
  mno_name: string | null;
  updatedAt: string;
  createdAt: string;
};

export type StationStatus = "published" | "inactive" | "pending";

export type Station = {
  id: number;
  station_id: string;
  operator_id: number;
  notes: string | null;
  extra_address: string | null;
  updatedAt: string;
  createdAt: string;
  is_confirmed: boolean;
  status?: StationStatus;
  statusChangedAt?: string;
  cells: Cell[];
  location: Location;
  operator: Operator;
  extra_identificators?: ExtraIdentificator;
  sectors?: Sector[];
};

export type RadioLineEquipmentType = {
  id: number;
  name: string;
  manufacturer?: { id: number; name: string };
};

export type RadioLine = {
  id: number;
  tx: {
    longitude: number;
    latitude: number;
    height: number;
    eirp?: number;
    antenna_attenuation?: number;
    transmitter?: { type?: RadioLineEquipmentType };
    antenna?: { type?: RadioLineEquipmentType; gain?: number; height?: number };
  };
  rx: {
    longitude: number;
    latitude: number;
    height: number;
    type?: RadioLineEquipmentType;
    gain?: number;
    height_antenna?: number;
    noise_figure?: number;
    atpc_attenuation?: number;
  };
  link: {
    freq: number;
    ch_num?: number;
    plan_symbol?: string;
    ch_width?: number;
    polarization?: string;
    modulation_type?: string;
    bandwidth?: string;
  };
  operator?: UkeOperator;
  permit: {
    number?: string;
    decision_type?: string;
    expiry_date: string;
  };
  updatedAt: string;
  createdAt: string;
};

export type StationSource = "internal" | "uke";

export type StationSortBy = "station_id" | "updatedAt" | "createdAt" | "relevance";
export type StationSortDirection = "asc" | "desc";

export type LocationSortBy = "id" | "updatedAt" | "createdAt";
export type LocationSortDirection = "asc" | "desc";

export type StationFilters = {
  operators: number[];
  bands: number[];
  rat: string[];
  status: StationStatus[];
  source: StationSource;
  recentDays: number | null;
  recentDateFields: ("createdAt" | "updatedAt")[];
  showStations: boolean;
  showRadiolines: boolean;
  radiolineOperators: number[];
  showHeatmap: boolean;
  showPlannedMeasurements: boolean;
};

export type StationWithoutCells = Omit<Station, "location" | "cells"> & {
  cells?: Cell[];
};

export type LocationInfo = {
  id: number;
  city?: string;
  address?: string;
  region?: string;
  latitude: number;
  longitude: number;
};

export type LocationWithStations = Omit<LocationInfo, "region"> & {
  updatedAt: string;
  createdAt: string;
  region: Region;
  stations: StationWithoutCells[];
};

export type UkeOperator = {
  id: number;
  name: string;
  full_name: string;
  parent_id?: number | null;
  mnc?: number | null;
};

export type UkeLocation = {
  id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
  updatedAt: string;
  createdAt: string;
  region: Region;
};

export type UkePermitSector = {
  id: number;
  azimuth: number | null;
  elevation: number | null;
  antenna_height: number | null;
  antenna_type: "indoor" | "outdoor" | null;
};

export type UkeStationPermit = {
  id: number;
  decision_number: string;
  decision_type: "zmP" | "P";
  expiry_date: string;
  source?: "permits" | "device_registry";
  sectors?: UkePermitSector[];
  updatedAt: string;
  createdAt: string;
  band?: Band | null;
};

export type UkePermit = UkeStationPermit & {
  station: Omit<UkeStation, "permits">;
};

export type UkeLocationWithPermits = {
  id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
  updatedAt: string;
  createdAt: string;
  region: Region;
  stations: UkeStation[];
};

export type UkeStation = {
  id: number;
  station_id: string;
  createdAt?: string;
  updatedAt?: string;
  operator: UkeOperator | null;
  permits: UkeStationPermit[];
  location?:
    | (Omit<UkeLocation, "createdAt" | "updatedAt"> & {
        createdAt?: string;
        updatedAt?: string;
      })
    | null;
};

export type CommentAttachment = {
  uuid: string;
  type: string;
};

export type StationComment = {
  id: string;
  station_id: number;
  author_id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments?: CommentAttachment[];
  author?: {
    id: string;
    username: string | null;
    name: string;
    image: string | null;
  };
};

export type Sector = {
  id: number;
  azimuth: number;
};

export type SectorDraft = {
  _localId: string;
  id?: number;
  azimuth: number | "";
};
