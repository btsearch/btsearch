import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import type { FloatingDialogRect } from "./geometry";
import type { DuplexRadioLink } from "@/features/map/utils";
import type { EmfReport, EmfSite, EmfSitePlace } from "@/features/station-details/station/emf/types";
import type { StationSource, UkeStation } from "@/types/station";

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

export type SI2PEMReportDialogPayload = {
  site: EmfSite;
  siteId: string;
  report: EmfReport;
  operatorName: string;
  operatorMnc?: number | null;
  place?: EmfSitePlace;
};

export type StationHistoryDialogPayload = {
  stationId: number;
  stationCode: string;
  operatorName: string;
  operatorBrandId: number | null;
};

export type StationDialogTarget = {
  id: number;
  source: StationSource;
  locationId?: number;
  ukeStation?: UkeStation;
  switchedFrom?: StationDialogTarget;
};

export type TerrainProfileDialogPayload = {
  placement: FloatingDialogRect;
  isCollapsed: boolean;
  renderPanel: (frame: FloatingDialogPanelFrameProps) => ReactNode;
  onRequestClose: () => void;
};

export type FloatingDialogOpenRequest =
  | ({ kind: "station" } & StationDialogTarget)
  | { kind: "radioline"; link: DuplexRadioLink }
  | ({ kind: "si2pem-report"; openRequestId: number } & SI2PEMReportDialogPayload)
  | ({ kind: "station-history" } & StationHistoryDialogPayload)
  | ({ kind: "terrain-profile" } & TerrainProfileDialogPayload);

export type FloatingDialogKind = FloatingDialogOpenRequest["kind"];

export type FloatingDialogItem = FloatingDialogOpenRequest & {
  key: string;
  frameId: number;
  rect: FloatingDialogRect;
  zIndex: number;
};

export type StationHistoryFloatingDialogItem = Extract<FloatingDialogItem, { kind: "station-history" }>;

export function getTopDialog(dialogs: FloatingDialogItem[]): FloatingDialogItem | undefined {
  let topDialog: FloatingDialogItem | undefined;
  for (const dialog of dialogs) {
    if (topDialog === undefined || dialog.zIndex > topDialog.zIndex) topDialog = dialog;
  }
  return topDialog;
}
