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
  className?: string;
  contentClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  bodyRef?: Ref<HTMLDivElement>;
  bodyContentRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  headerDragProps?: HTMLAttributes<HTMLDivElement>;
};

export type FloatingDialogKind = "station" | "uke-permit" | "radioline" | "si2pem-report";

export type SI2PEMReportDialogPayload = {
  report: PemReport;
  latitude: number;
  longitude: number;
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

export type FloatingDialogItem =
  | StationFloatingDialogItem
  | UkePermitFloatingDialogItem
  | RadioLineFloatingDialogItem
  | SI2PEMReportFloatingDialogItem;

export type FloatingDialogOpenRequest =
  | { kind: "station"; id: number; source: StationSource }
  | { kind: "uke-permit"; station: UkeStation }
  | { kind: "radioline"; link: DuplexRadioLink }
  | ({ kind: "si2pem-report" } & SI2PEMReportDialogPayload);
