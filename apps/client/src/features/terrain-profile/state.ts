import type { TerrainProfileReceiver, TerrainProfileStationTarget } from "./types";

export const DEFAULT_RECEIVER_HEIGHT_AGL_M = 5;

export type TerrainProfileState = {
  isOpen: boolean;
  station: TerrainProfileStationTarget | null;
  receiver: TerrainProfileReceiver | null;
  antennaKey?: string;
  antennaSelectionOrigin?: "auto" | "manual";
  analysisRevision: number;
};

export const INITIAL_TERRAIN_PROFILE_STATE: TerrainProfileState = {
  isOpen: false,
  station: null,
  receiver: null,
  analysisRevision: 0,
};

export type TerrainProfileAction =
  | { type: "close" }
  | { type: "set_station"; station: TerrainProfileStationTarget }
  | { type: "set_receiver"; receiver: TerrainProfileReceiver }
  | { type: "set_antenna"; antennaKey: string; origin: "auto" | "manual" }
  | { type: "retry" };

export function terrainProfileReducer(state: TerrainProfileState, action: TerrainProfileAction): TerrainProfileState {
  switch (action.type) {
    case "close":
      return { ...INITIAL_TERRAIN_PROFILE_STATE, analysisRevision: state.analysisRevision };
    case "set_station":
      return {
        ...state,
        isOpen: true,
        station: action.station,
        antennaKey: undefined,
        antennaSelectionOrigin: undefined,
        analysisRevision: state.analysisRevision + 1,
      };
    case "set_receiver": {
      const receiverMoved =
        state.receiver === null || state.receiver.latitude !== action.receiver.latitude || state.receiver.longitude !== action.receiver.longitude;
      const clearAutoSelection = receiverMoved && state.antennaSelectionOrigin === "auto";
      return {
        ...state,
        receiver: action.receiver,
        antennaKey: clearAutoSelection ? undefined : state.antennaKey,
        antennaSelectionOrigin: clearAutoSelection ? undefined : state.antennaSelectionOrigin,
        analysisRevision: state.analysisRevision + 1,
      };
    }
    case "set_antenna":
      return {
        ...state,
        antennaKey: action.antennaKey,
        antennaSelectionOrigin: action.origin,
        analysisRevision: state.analysisRevision + 1,
      };
    case "retry":
      return { ...state, analysisRevision: state.analysisRevision + 1 };
  }
}
