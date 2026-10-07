import { dbMock } from "./boundaries.js";
import { readLocation } from "./readFixtures.js";
import { stationRow, visibleStation } from "./stationFixtures.js";

export function placedStation() {
  const location = { ...readLocation.location, id: 2 };
  const current = stationRow({ location_id: 2, location, sectors: [] });
  visibleStation(current);
  dbMock.query.stations.findFirst.mockResolvedValue(current);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  return { current, location };
}

function auditWrite(audits: number) {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  for (let index = 0; index < audits; index += 1) dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
}

export function detachPlacedStation(current: ReturnType<typeof stationRow>) {
  const saved = { ...current, location_id: null, location: null };
  auditWrite(1);
  dbMock.enqueueFor("update", "stations", [], [saved]);
  dbMock.enqueueFor("select", "stations", [{ total: 1 }]);
  dbMock.enqueueFor("select", "cells", []);
  visibleStation(saved);
  dbMock.enqueueFor("select", "extra_identificators", []);
  return saved;
}

export function movePlacedStation(mode: "station" | "location") {
  const { current, location } = placedStation();
  const movedLocation = { ...location, id: mode === "station" ? 3 : 2, latitude: 52.1, longitude: 21.1 };
  const saved = { ...current, location_id: movedLocation.id, location: movedLocation };
  dbMock.enqueueFor("select", "regions", [{ id: 1 }]);
  dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
  dbMock.query.locations.findFirst.mockResolvedValue(undefined);
  auditWrite(mode === "station" ? 2 : 1);
  if (mode === "station") {
    dbMock.enqueueFor("insert", "locations", [movedLocation]);
    dbMock.enqueueFor("update", "stations", [saved], []);
    dbMock.enqueueFor("select", "stations", [{ remaining: 1 }]);
    dbMock.query.stationPhotoSelections.findMany.mockResolvedValue([]);
  } else {
    dbMock.enqueueFor("update", "locations", [movedLocation]);
    dbMock.enqueueFor("update", "stations", []);
  }
  dbMock.enqueueFor("select", "cells", []);
  visibleStation(saved);
  dbMock.enqueueFor("select", "extra_identificators", []);
  dbMock.enqueueFor("select", "stations", []);
  return { current, saved, location, movedLocation };
}
