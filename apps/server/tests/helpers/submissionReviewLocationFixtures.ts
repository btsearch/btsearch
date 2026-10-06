import { dbMock } from "./boundaries.js";
import { readDate } from "./readFixtures.js";
import { submissionId, submitterId } from "./submissionFixtures.js";
import { prepareExistingPhotoReview, serializeReview } from "./submissionReviewFixtures.js";

export function prepareLocationMove(move: "station" | "location", existingTarget: boolean) {
  const scenario = prepareExistingPhotoReview();
  const current = scenario.location;
  const target = { ...current, id: 3, latitude: 52.1, longitude: 21.2 };
  const proposedLocation = {
    ...current,
    id: 1,
    submission_id: submissionId,
    latitude: target.latitude,
    longitude: target.longitude,
    move,
    structure_owner_name: null,
    changed_fields: ["latitude", "longitude"],
  };
  dbMock.query.proposedLocations.findFirst.mockResolvedValue(proposedLocation);
  dbMock.query.locations.findFirst.mockResolvedValue(existingTarget ? target : undefined);
  dbMock.query.stations.findFirst.mockImplementation(async (options) => {
    const id = (options as { where?: { id?: number } } | undefined)?.where?.id ?? 12;
    return { ...scenario.station, id, station_id: `SITE-${id}`, status: "published" };
  });
  dbMock.query.stationPhotoSelections.findMany.mockResolvedValue([]);
  dbMock.query.locationPhotos.findMany.mockResolvedValue([]);
  return { ...scenario, current, target, proposedLocation, move, existingTarget };
}

export function writeLocationMove(scenario: ReturnType<typeof prepareLocationMove>, orphaned = false, withSharedPhoto = false) {
  const { current, target, move, existingTarget } = scenario;
  const wholeExisting = move === "location" && existingTarget;
  const destinationId = move === "location" && !existingTarget ? current.id : target.id;
  const previous = withSharedPhoto ? [{ station_id: 12, location_photo_id: 90, is_main: true }] : [];
  const next = withSharedPhoto ? [{ station_id: 12, location_photo_id: 100, is_main: true }] : [];
  const originalPhoto = {
    id: 90,
    location_id: current.id,
    attachment_id: 8,
    submission_id: submissionId,
    uploaded_by: submitterId,
    note: "Shared tower",
    taken_at: readDate,
    createdAt: readDate,
  };
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "submissions", [scenario.submission]);
  dbMock.enqueueFor("select", "station_photo_selections", previous, ...(withSharedPhoto ? [[{ location_photo_id: 90 }]] : []), next);
  if (!existingTarget) {
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    if (move === "location") dbMock.enqueueFor("update", "locations", [{ ...target, id: current.id }]);
    else dbMock.enqueueFor("insert", "locations", [target]);
    dbMock.enqueueFor("insert", "audit_logs", []);
  }
  if (wholeExisting) dbMock.enqueueFor("select", "stations", [{ id: 12 }, { id: 13 }]);
  if (move === "station" || wholeExisting) {
    const residents = wholeExisting ? [12, 13] : [12];
    for (const id of residents) {
      dbMock.enqueueFor("update", "stations", [
        { ...scenario.station, id, station_id: `SITE-${id}`, status: "published", location_id: destinationId, location: target },
      ]);
      dbMock.enqueueFor("insert", "audit_logs", []);
    }
    if (move === "station") dbMock.enqueueFor("select", "stations", [{ remaining: orphaned ? 0 : 1 }]);
  }
  if (withSharedPhoto) {
    dbMock.query.stationPhotoSelections.findMany.mockImplementation(async (options) => {
      const stationId = (options as { where: { station_id: number } }).where.station_id;
      return [{ id: stationId, station_id: stationId, location_photo_id: 90, is_main: true, locationPhoto: originalPhoto }];
    });
    dbMock.enqueueFor("select", "location_photos", [{ id: 100, attachment_id: 8 }], [{ id: 100, attachment_id: 8 }]);
    dbMock.enqueueFor("insert", "station_photo_selections", [], []);
    dbMock.enqueueFor("delete", "station_photo_selections", [], []);
    dbMock.enqueueFor("select", "submission_location_photo_selections", [
      { id: 1, submission_id: submissionId, location_photo_id: 90, is_main: true, is_removal: false, createdAt: readDate },
    ]);
    dbMock.enqueueFor("insert", "submission_location_photo_selections", []);
    dbMock.enqueueFor("delete", "location_photos", [originalPhoto]);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
  }
  if (wholeExisting || (move === "station" && orphaned)) {
    dbMock.enqueueFor("delete", "locations", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
  }
  dbMock.enqueueFor("update", "stations", []);
  dbMock.enqueueFor("select", "cells", []);
  dbMock.enqueueFor("update", "submissions", [scenario.approved]);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "stations", [{ operatorName: "Operator", operatorMnc: 7 }]);
  dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222" }]);
  serializeReview(scenario);
  return { originalPhoto, destinationId };
}
