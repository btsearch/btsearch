import type { NsgCell, NsgTimestamp } from "../../model";
import type { QualcommNrMeasurement } from "../qualcomm/nrMeasurement";

export type LteAnchor = Readonly<{
  cell: NsgCell;
  derivedCellIndexOffset: number;
}>;

export type TimedNrMeasurement = NsgTimestamp &
  Readonly<{
    recordOffset: number;
    streamIndex: number;
    measurement: QualcommNrMeasurement;
  }>;

export type TimedLteServingCellInfo = Readonly<{
  streamIndex: number;
  elapsedUs: number;
  cellIdentity: number;
  earfcn: number;
}>;

export type DefaultDataSubscriptionChange = Readonly<{
  elapsedUs: number;
  subId: number;
}>;
