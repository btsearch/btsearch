import type { CSSProperties, HTMLAttributes, Ref } from "react";

import type { FloatingDialogRect } from "./geometry";
import type { DuplexRadioLink } from "@/features/map/utils";
import type { PemReport } from "@/features/station-details/api";
import type { TabId } from "@/features/station-details/tabs";
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

export type StationDialogTarget = {
  id: number;
  source: StationSource;
  initialTab?: TabId;
  ukeStation?: UkeStation;
  switchedFrom?: StationDialogTarget;
};

export type FloatingDialogOpenRequest =
  | ({ kind: "station" } & StationDialogTarget)
  | { kind: "radioline"; link: DuplexRadioLink }
  | ({ kind: "si2pem-report" } & SI2PEMReportDialogPayload)
  | ({ kind: "station-history" } & StationHistoryDialogPayload);

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
