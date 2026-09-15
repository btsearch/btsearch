import type { AuditEntity } from "@openbts/shared/audit";

import type { RevertStrategy } from "../types.js";
import { planCellRevert } from "./cells.js";
import { planExtraIdentificatorRevert } from "./extraIdentificators.js";
import { planLocationPhotoRevert } from "./locationPhotos.js";
import { planLocationRevert } from "./locations.js";
import { planPhotoSelectionRevert } from "./photoSelections.js";
import { planReferenceRevert } from "./reference.js";
import { planSectorRevert } from "./sectors.js";
import { planStationRevert } from "./stations.js";

export function strategyFor(entity: AuditEntity): RevertStrategy | null {
  switch (entity) {
    case "cells":
      return planCellRevert;
    case "stations":
      return planStationRevert;
    case "locations":
      return planLocationRevert;
    case "location_photos":
      return planLocationPhotoRevert;
    case "station_sectors":
      return planSectorRevert;
    case "extra_identificators":
      return planExtraIdentificatorRevert;
    case "station_photo_selections":
      return planPhotoSelectionRevert;
    case "operators":
    case "bands":
    case "regions":
      return planReferenceRevert;
    case "station_comments":
    case "submissions":
    case "submission_photos":
    case "user_lists":
    case "settings":
      return null;
  }
}
