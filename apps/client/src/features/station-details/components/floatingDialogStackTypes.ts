import type { CSSProperties, HTMLAttributes, Ref } from "react";

import type { DuplexRadioLink } from "@/features/map/utils";
import type { StationSource, UkeStation } from "@/types/station";

import type { PemReport } from "../api";
import type { StationDialogRect } from "./stationDialogGeometry";

export function assertNever(value: never): never {
  throw new Error(`Unexpected floating dialog value: ${String(value)}`);
}

export type FloatingDialogPanelFrameProps = {
  onClose: () => void;
  modal?: boolean;
  className?: string;
  contentClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  bodyRef?: Ref<HTMLDivElement>;
  bodyContentRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  headerDragProps?: HTMLAttributes<HTMLDivElement>;
};

export function getStationHistoryTriggerId(stationId: number): string {
  return `station-history-trigger-${stationId}`;
}

export type FloatingDialogKind = "station" | "uke-permit" | "radioline" | "si2pem-report" | "station-history";

export type SI2PEMReportDialogPayload = {
  report: PemReport;
  latitude: number;
  longitude: number;
  operatorName: string;
  operatorMnc?: number | null;
};

export type StationHistoryDialogPayload = {
  stationId: number;
  stationCode: string;
  operatorName: string;
  operatorMnc?: number | null;
};

type FloatingDialogItemBase = {
  key: string;
  rect: StationDialogRect;
  zIndex: number;
};

export type StationFloatingDialogItem = FloatingDialogItemBase & {
  kind: "station";
  id: number;
  source: StationSource;
};

export type UkePermitFloatingDialogItem = FloatingDialogItemBase & {
  kind: "uke-permit";
  station: UkeStation;
};

export type RadioLineFloatingDialogItem = FloatingDialogItemBase & {
  kind: "radioline";
  link: DuplexRadioLink;
};

export type SI2PEMReportFloatingDialogItem = FloatingDialogItemBase & SI2PEMReportDialogPayload & { kind: "si2pem-report" };

export type StationHistoryFloatingDialogItem = FloatingDialogItemBase & StationHistoryDialogPayload & { kind: "station-history" };

export type FloatingDialogItem =
  | StationFloatingDialogItem
  | UkePermitFloatingDialogItem
  | RadioLineFloatingDialogItem
  | SI2PEMReportFloatingDialogItem
  | StationHistoryFloatingDialogItem;

export type FloatingDialogOpenRequest =
  | { kind: "station"; id: number; source: StationSource }
  | { kind: "uke-permit"; station: UkeStation }
  | { kind: "radioline"; link: DuplexRadioLink }
  | ({ kind: "si2pem-report" } & SI2PEMReportDialogPayload)
  | ({ kind: "station-history" } & StationHistoryDialogPayload);
