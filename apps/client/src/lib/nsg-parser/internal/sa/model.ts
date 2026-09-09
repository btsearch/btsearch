import type { NsgTimestamp } from "../../model";
import type { QualcommNrConfigurationInfo } from "../qualcomm/nrConfiguration";
import type { QualcommNrServingCellInfo } from "../qualcomm/nrServingCell";

export type TimedNrConfigurationInfo = NsgTimestamp &
  Readonly<{
    recordOffset: number;
    streamIndex: number;
    configuration: QualcommNrConfigurationInfo;
  }>;

export type TimedNrServingCellInfo = NsgTimestamp &
  Readonly<{
    recordOffset: number;
    streamIndex: number;
    info: QualcommNrServingCellInfo;
  }>;
