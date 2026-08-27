import type { RatType } from "@/features/shared/rat";
import type { Band, CellType, Operator, Region, SectorDraft } from "@/types/station";

export type { RatType };

export type GSMCellDetails = {
  lac: number;
  cid: number;
  e_gsm?: boolean;
};

export type UMTSCellDetails = {
  lac?: number;
  arfcn?: number;
  rnc: number;
  cid: number;
};

export type LTECellDetails = {
  tac: number;
  enbid: number;
  clid: number;
  pci?: number;
  earfcn?: number;
  supports_iot?: boolean;
};

export type NRType = "nsa" | "sa";

export type NRCellDetails = {
  type?: NRType;
  nrtac?: number;
  gnbid?: number;
  clid?: number;
  nci?: number;
  pci?: number;
  arfcn?: number;
  supports_nr_redcap?: boolean;
};

export type CellFormDetails = GSMCellDetails | UMTSCellDetails | LTECellDetails | NRCellDetails;

export type ProposedCellForm = {
  id: string;
  existingCellId?: number;
  _sectorLocalId?: string | null;
  rat: RatType;
  band_id: number | null;
  type?: CellType | null;
  notes?: string;
  is_confirmed?: boolean;
  details: Partial<CellFormDetails>;
};

export type ProposedStationForm = {
  station_id?: string;
  operator_id: number | null;
  notes?: string;
  networks_id?: number | null;
  networks_name?: string | null;
  mno_name?: string | null;
};

export type ProposedLocationForm = {
  region_id: number | null;
  city?: string;
  address?: string;
  longitude: number | null;
  latitude: number | null;
};

export type CellOperation = "add" | "update" | "delete";

export type CellPayload = {
  operation: CellOperation;
  target_cell_id?: number;
  target_sector_id?: number | null;
  sector_local_id?: string | null;
  sector_unassigned?: boolean;
  band_id?: number | null;
  rat?: RatType;
  type?: CellType | null;
  notes?: string | null;
  details?: Partial<CellFormDetails>;
};

export type SectorPayload = {
  local_id: string;
  target_sector_id?: number | null;
  azimuth: number;
};

export type SubmissionFormData = {
  station_id: number | null;
  type: "new" | "update" | "delete";
  submitter_note?: string;
  station?: ProposedStationForm;
  location?: ProposedLocationForm;
  sectors?: SectorPayload[];
  cells: CellPayload[];
  pending_photos?: number;
  location_photo_ids?: number[];
  location_photo_ids_to_remove?: number[];
  main_location_photo_id?: number;
};

export type SubmissionMode = "existing" | "new";

export type StationAction = "update" | "delete";

export type { Band, Operator, Region };
export type { SectorDraft };
