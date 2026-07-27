import type { LocationPhoto } from "@/features/station-details/api";

import type { RAT_ORDER } from "../cells/rat";

export type SubmissionLocationPhoto = LocationPhoto & { is_main: boolean };

export type SubmissionUser = {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
};

export type ProposedCell = {
  id: number;
  submission_id: string;
  operation: "add" | "update" | "delete";
  target_cell_id: number | null;
  target_sector_id: number | null;
  sector_local_id: string | null;
  sector_unassigned: boolean;
  station_id: number | null;
  band_id: number | null;
  rat: (typeof RAT_ORDER)[number];
  notes: string | null;
  is_confirmed: boolean;
  details: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProposedSector = {
  id: number;
  submission_id: string;
  target_sector_id: number | null;
  local_id: string;
  azimuth: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ProposedStation = {
  id: number;
  submission_id: string;
  station_id: string | null;
  operator_id: number | null;
  location_id: number | null;
  notes: string | null;
  networks_id?: number | null;
  networks_name?: string | null;
  mno_name?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProposedLocation = {
  id: number;
  submission_id: string;
  region_id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
  createdAt?: string;
  updatedAt?: string;
};

type SubmissionBase = {
  id: string;
  station_id: number | null;
  submitter_id: string;
  status: "pending" | "approved" | "rejected";
  type: "new" | "update" | "delete";
  reviewer: SubmissionUser | null;
  review_notes: string | null;
  createdAt: string;
  updatedAt: string;
  reviewed_at: string | null;
  pending_photos: number | null;
};

export type SubmissionRow = SubmissionBase & {
  station?: { station_id: string; operator_id: number | null } | null;
  proposedStation?: ProposedStation | null;
};

export type SubmissionDetail = SubmissionBase & {
  submitter_note: string | null;
  station: { id: number; station_id: string; operator_id: number; notes: string | null; is_confirmed: boolean } | null;
  submitter: SubmissionUser;
  proposedStation: ProposedStation | null;
  proposedLocation: ProposedLocation | null;
  sectors: ProposedSector[];
  cells: ProposedCell[];
  locationPhotoSelections: SubmissionLocationPhoto[];
  locationPhotoRemovalSelections: LocationPhoto[];
};

export type SubmissionListItem = SubmissionBase & {
  submitter_note: string | null;
  station: { id: number; station_id: string; operator_id: number | null } | null;
  submitter: SubmissionUser;
  proposedStation: ProposedStation | null;
  cells: ProposedCellWithDetails[];
};

export type ProposedCellWithDetails = {
  id: number;
  submission_id: string;
  operation: "add" | "update" | "delete";
  target_cell_id: number | null;
  target_sector_id: number | null;
  sector_local_id: string | null;
  sector_unassigned: boolean;
  station_id: number | null;
  band_id: number | null;
  rat: string | null;
  notes: string | null;
  is_confirmed: boolean;
  details: Record<string, unknown> | null;
};
