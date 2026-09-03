export interface OperatorSpec {
  key: string;
  name: string;
}

export interface FileSpec {
  filePath: string;
  operator: OperatorSpec;
}

export interface CliOptions {
  apply: boolean;
  files: FileSpec[];
}

export interface MnoNameColumns {
  stationId: number;
  mnoName: number;
}

export interface MnoNameConflict {
  stationId: string;
  first: string;
  next: string;
}

export interface ParsedMnoNames {
  filePath: string;
  operator: OperatorSpec;
  sheetName: string;
  rowCount: number;
  stationMnoNames: Map<string, string>;
  conflicts: MnoNameConflict[];
}

export interface GroupedMnoNames {
  operator: OperatorSpec;
  stationMnoNames: Map<string, string>;
}

export interface TargetMnoName {
  stationPk: number;
  stationId: string;
  mnoName: string;
}

export interface ExistingExtraIdentifier {
  id: number;
  station_id: number;
  mno_name: string | null;
}

export interface PlannedChange {
  stationPk: number;
  stationId: string;
  oldMnoName: string | null;
  newMnoName: string;
  action: "insert" | "update";
}

export interface OperatorPlan {
  operator: OperatorSpec;
  operatorId: number;
  inputStationCount: number;
  matchedStationCount: number;
  missingStationIds: string[];
  unchangedCount: number;
  inserts: TargetMnoName[];
  updates: Array<TargetMnoName & { extraIdentifierIds: number[]; oldMnoName: string | null }>;
  preview: PlannedChange[];
}
