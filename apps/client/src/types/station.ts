type Band = {
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

export type CellType = "MACROCELL" | "MICROCELL" | "PICOCELL" | "FEMTOCELL";

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

export type StationSource = "internal" | "official";
