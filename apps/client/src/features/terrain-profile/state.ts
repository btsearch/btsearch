import { DEFAULT_RECEIVER_HEIGHT_METERS } from "./receiverRange";
import type { GeoPoint, TerrainProfileRequest, TerrainProfileStationTarget } from "./types";

export type TerrainProfileChoice = {
  receiverPoint: GeoPoint;
  receiverHeightMeters: number;
  antennaKey: string | null;
};

type TerrainProfileSession = {
  station: TerrainProfileStationTarget;
  receiverPoint: GeoPoint | null;
  receiverHeightMeters: number;
  antennaKey: string | null;
  isPickingPoint: boolean;
  isCollapsed: boolean;
};

type TerrainProfileAction =
  | { type: "start"; station: TerrainProfileStationTarget; startsCollapsed: boolean }
  | { type: "close" }
  | { type: "place_receiver"; point: GeoPoint }
  | { type: "set_receiver_height"; heightMeters: number }
  | { type: "select_antenna"; antennaKey: string | null }
  | { type: "toggle_point_pick" }
  | { type: "cancel_point_pick" }
  | { type: "set_collapsed"; isCollapsed: boolean }
  | { type: "restore_choice"; choice: TerrainProfileChoice | null };

function isSameStation(left: TerrainProfileStationTarget, right: TerrainProfileStationTarget): boolean {
  return left.source === right.source && left.id === right.id;
}

export function isSameChoice(left: TerrainProfileChoice, right: TerrainProfileChoice): boolean {
  return (
    left.receiverPoint.latitude === right.receiverPoint.latitude &&
    left.receiverPoint.longitude === right.receiverPoint.longitude &&
    left.receiverHeightMeters === right.receiverHeightMeters &&
    left.antennaKey === right.antennaKey
  );
}

export function terrainProfileReducer(session: TerrainProfileSession | null, action: TerrainProfileAction): TerrainProfileSession | null {
  if (action.type === "start") {
    if (session !== null && isSameStation(session.station, action.station)) return { ...session, isCollapsed: action.startsCollapsed };
    return {
      station: action.station,
      receiverPoint: null,
      receiverHeightMeters: DEFAULT_RECEIVER_HEIGHT_METERS,
      antennaKey: null,
      isPickingPoint: false,
      isCollapsed: action.startsCollapsed,
    };
  }
  if (session === null) return null;

  switch (action.type) {
    case "close":
      return null;
    case "place_receiver":
      return { ...session, receiverPoint: action.point, isPickingPoint: false };
    case "set_receiver_height":
      return { ...session, receiverHeightMeters: action.heightMeters };
    case "select_antenna":
      return { ...session, antennaKey: action.antennaKey };
    case "toggle_point_pick":
      return { ...session, isPickingPoint: session.receiverPoint !== null && !session.isPickingPoint };
    case "cancel_point_pick":
      return { ...session, isPickingPoint: false };
    case "set_collapsed":
      return { ...session, isCollapsed: action.isCollapsed };
    case "restore_choice":
      if (action.choice === null) return { ...session, receiverPoint: null, antennaKey: null, isPickingPoint: false };
      return { ...session, ...action.choice, isPickingPoint: false };
  }
}

export function toTerrainProfileRequest(station: TerrainProfileStationTarget, choice: TerrainProfileChoice): TerrainProfileRequest {
  const request: TerrainProfileRequest = {
    station: { source: station.source, id: station.id },
    receiver: { latitude: choice.receiverPoint.latitude, longitude: choice.receiverPoint.longitude, heightMeters: choice.receiverHeightMeters },
  };
  if (choice.antennaKey !== null) request.antennaKey = choice.antennaKey;
  return request;
}
