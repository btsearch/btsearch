import { defineRelations } from "drizzle-orm";

import {
  accounts,
  apikeys,
  attachments,
  auditLogs,
  locationPhotos,
  notifications,
  passkeys,
  pushSubscriptions,
  stationComments,
  stationPhotoSelections,
  stationWatches,
  twoFactors,
  ukeStationWatches,
  userLists,
  users,
} from "./auth.ts";
import {
  bands,
  cells,
  deletedEntries,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  radioLinesManufacturers,
  radiolinesAntennaTypes,
  radiolinesTransmitterTypes,
  regions,
  stationSectors,
  stations,
  stationsPermits,
  statsSnapshots,
  ukeImportMetadata,
  ukeLocations,
  ukeOperators,
  ukePermitSectors,
  ukePermits,
  ukeRadiolines,
  ukeStations,
  umtsCells,
} from "./bts.ts";
import {
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
  submissionLocationPhotoSelections,
  submissionPhotos,
  submissions,
} from "./submissions.ts";

export const relations = defineRelations(
  {
    bands,
    cells,
    locations,
    operators,
    regions,
    stations,
    stationSectors,
    ukeStations,
    ukePermits,
    ukePermitSectors,
    radioLinesManufacturers,
    radiolinesAntennaTypes,
    radiolinesTransmitterTypes,
    ukeRadiolines,
    stationsPermits,
    gsmCells,
    umtsCells,
    lteCells,
    nrCells,
    extraIdentificators,
    ukeLocations,
    ukeOperators,
    accounts,
    apikeys,
    attachments,
    auditLogs,
    notifications,
    passkeys,
    pushSubscriptions,
    locationPhotos,
    stationComments,
    stationPhotoSelections,
    stationWatches,
    ukeStationWatches,
    twoFactors,
    userLists,
    users,
    submissions,
    proposedCells,
    proposedGSMCells,
    proposedLTECells,
    proposedLocations,
    proposedNRCells,
    proposedSectors,
    proposedStations,
    proposedUMTSCells,
    submissionPhotos,
    submissionLocationPhotoSelections,
    ukeImportMetadata,
    deletedEntries,
    statsSnapshots,
  },
  (helpers) => ({
    operators: {
      parent: helpers.one.operators({
        from: helpers.operators.parent_id,
        to: helpers.operators.id,
      }),
      children: helpers.many.operators(),
      stations: helpers.many.stations(),
      ukeStations: helpers.many.ukeStations(),
    },
    regions: {
      locations: helpers.many.locations(),
      ukeLocations: helpers.many.ukeLocations(),
    },
    locations: {
      region: helpers.one.regions({
        from: helpers.locations.region_id,
        to: helpers.regions.id,
        optional: false,
      }),
      stations: helpers.many.stations(),
    },
    stations: {
      location: helpers.one.locations({
        from: helpers.stations.location_id,
        to: helpers.locations.id,
        optional: false,
      }),
      operator: helpers.one.operators({
        from: helpers.stations.operator_id,
        to: helpers.operators.id,
        optional: false,
      }),
      cells: helpers.many.cells(),
      extra_identificators: helpers.one.extraIdentificators({
        from: helpers.stations.id,
        to: helpers.extraIdentificators.station_id,
      }),
      sectors: helpers.many.stationSectors(),
      stationWatches: helpers.many.stationWatches(),
    },
    stationSectors: {
      station: helpers.one.stations({
        from: helpers.stationSectors.station_id,
        to: helpers.stations.id,
        optional: false,
      }),
    },
    cells: {
      station: helpers.one.stations({
        from: helpers.cells.station_id,
        to: helpers.stations.id,
        optional: false,
      }),
      band: helpers.one.bands({
        from: helpers.cells.band_id,
        to: helpers.bands.id,
        optional: false,
      }),
      gsm: helpers.one.gsmCells({
        from: helpers.cells.id,
        to: helpers.gsmCells.cell_id,
        optional: false,
      }),
      umts: helpers.one.umtsCells({
        from: helpers.cells.id,
        to: helpers.umtsCells.cell_id,
        optional: false,
      }),
      lte: helpers.one.lteCells({
        from: helpers.cells.id,
        to: helpers.lteCells.cell_id,
        optional: false,
      }),
      nr: helpers.one.nrCells({
        from: helpers.cells.id,
        to: helpers.nrCells.cell_id,
        optional: false,
      }),
    },
    bands: {
      cells: helpers.many.cells(),
    },
    gsmCells: {
      cell: helpers.one.cells({
        from: helpers.gsmCells.cell_id,
        to: helpers.cells.id,
        optional: false,
      }),
    },
    umtsCells: {
      cell: helpers.one.cells({
        from: helpers.umtsCells.cell_id,
        to: helpers.cells.id,
        optional: false,
      }),
    },
    lteCells: {
      cell: helpers.one.cells({
        from: helpers.lteCells.cell_id,
        to: helpers.cells.id,
        optional: false,
      }),
    },
    nrCells: {
      cell: helpers.one.cells({
        from: helpers.nrCells.cell_id,
        to: helpers.cells.id,
        optional: false,
      }),
    },
    userLists: {
      list: helpers.one.users({
        from: helpers.userLists.created_by,
        to: helpers.users.id,
      }),
    },
    stationWatches: {
      user: helpers.one.users({
        from: helpers.stationWatches.userId,
        to: helpers.users.id,
      }),
      station: helpers.one.stations({
        from: helpers.stationWatches.stationId,
        to: helpers.stations.id,
      }),
    },
    ukeStationWatches: {
      user: helpers.one.users({
        from: helpers.ukeStationWatches.userId,
        to: helpers.users.id,
      }),
      station: helpers.one.ukeStations({
        from: helpers.ukeStationWatches.ukeStationId,
        to: helpers.ukeStations.id,
      }),
    },
    stationComments: {
      author: helpers.one.users({
        from: helpers.stationComments.user_id,
        to: helpers.users.id,
      }),
      station: helpers.one.stations({
        from: helpers.stationComments.station_id,
        to: helpers.stations.id,
      }),
    },
    auditLogs: {
      user: helpers.one.users({
        from: helpers.auditLogs.invoked_by,
        to: helpers.users.id,
      }),
    },
    users: {
      accounts: helpers.many.accounts(),
      comments: helpers.many.stationComments(),
      lists: helpers.many.userLists(),
      apiKeys: helpers.many.apikeys(),
      passkeys: helpers.many.passkeys(),
      twoFactors: helpers.many.twoFactors(),
      attachments: helpers.many.attachments({
        from: helpers.users.id,
        to: helpers.attachments.author_id,
        alias: "author",
      }),
      auditLogs: helpers.many.auditLogs(),
      submittedSubmissions: helpers.many.submissions({
        from: helpers.users.id,
        to: helpers.submissions.submitter_id,
        alias: "submitter",
      }),
      reviewedSubmissions: helpers.many.submissions({
        from: helpers.users.id,
        to: helpers.submissions.reviewer_id,
        alias: "reviewer",
      }),
      notifications: helpers.many.notifications(),
      pushSubscriptions: helpers.many.pushSubscriptions(),
      stationWatches: helpers.many.stationWatches(),
      ukeStationWatches: helpers.many.ukeStationWatches(),
    },
    notifications: {
      user: helpers.one.users({
        from: helpers.notifications.userId,
        to: helpers.users.id,
      }),
      station: helpers.one.stations({
        from: helpers.notifications.stationId,
        to: helpers.stations.id,
      }),
      ukeStation: helpers.one.ukeStations({
        from: helpers.notifications.ukeStationId,
        to: helpers.ukeStations.id,
      }),
    },
    pushSubscriptions: {
      user: helpers.one.users({
        from: helpers.pushSubscriptions.userId,
        to: helpers.users.id,
      }),
    },
    accounts: {
      users: helpers.one.users({
        from: helpers.accounts.userId,
        to: helpers.users.id,
      }),
    },
    apikeys: {
      users: helpers.one.users({
        from: helpers.apikeys.referenceId,
        to: helpers.users.id,
      }),
    },
    passkeys: {
      users: helpers.one.users({
        from: helpers.passkeys.userId,
        to: helpers.users.id,
      }),
    },
    twoFactors: {
      users: helpers.one.users({
        from: helpers.twoFactors.userId,
        to: helpers.users.id,
      }),
    },
    radioLinesManufacturers: {
      radiolinesAntennaTypes: helpers.many.radiolinesAntennaTypes(),
      radioLinestTansmitterTypes: helpers.many.radiolinesTransmitterTypes(),
    },
    radiolinesAntennaTypes: {
      manufacturer: helpers.one.radioLinesManufacturers({
        from: helpers.radiolinesAntennaTypes.manufacturer_id,
        to: helpers.radioLinesManufacturers.id,
      }),
    },
    radiolinesTransmitterTypes: {
      manufacturer: helpers.one.radioLinesManufacturers({
        from: helpers.radiolinesTransmitterTypes.manufacturer_id,
        to: helpers.radioLinesManufacturers.id,
        optional: false,
      }),
    },
    ukeRadiolines: {
      txTransmitterType: helpers.one.radiolinesTransmitterTypes({
        from: helpers.ukeRadiolines.tx_transmitter_type_id,
        to: helpers.radiolinesTransmitterTypes.id,
        optional: false,
      }),
      txAntennaType: helpers.one.radiolinesAntennaTypes({
        from: helpers.ukeRadiolines.tx_antenna_type_id,
        to: helpers.radiolinesAntennaTypes.id,
        optional: false,
      }),
      rxAntennaType: helpers.one.radiolinesAntennaTypes({
        from: helpers.ukeRadiolines.rx_antenna_type_id,
        to: helpers.radiolinesAntennaTypes.id,
        optional: false,
      }),
      operator: helpers.one.ukeOperators({
        from: helpers.ukeRadiolines.operator_id,
        to: helpers.ukeOperators.id,
        optional: false,
      }),
    },
    ukePermits: {
      band: helpers.one.bands({
        from: helpers.ukePermits.band_id,
        to: helpers.bands.id,
        optional: false,
      }),
      station: helpers.one.ukeStations({
        from: helpers.ukePermits.uke_station_id,
        to: helpers.ukeStations.id,
        optional: false,
      }),
      sectors: helpers.many.ukePermitSectors(),
      stationsPermits: helpers.many.stationsPermits(),
    },
    ukePermitSectors: {
      permit: helpers.one.ukePermits({
        from: helpers.ukePermitSectors.permit_id,
        to: helpers.ukePermits.id,
        optional: false,
      }),
    },
    ukeLocations: {
      region: helpers.one.regions({
        from: helpers.ukeLocations.region_id,
        to: helpers.regions.id,
        optional: false,
      }),
      stations: helpers.many.ukeStations(),
    },
    ukeStations: {
      operator: helpers.one.operators({
        from: helpers.ukeStations.operator_id,
        to: helpers.operators.id,
        optional: false,
      }),
      location: helpers.one.ukeLocations({
        from: helpers.ukeStations.location_id,
        to: helpers.ukeLocations.id,
        optional: false,
      }),
      permits: helpers.many.ukePermits(),
      ukeStationWatches: helpers.many.ukeStationWatches(),
    },
    stationsPermits: {
      permit: helpers.one.ukePermits({
        from: helpers.stationsPermits.permit_id,
        to: helpers.ukePermits.id,
        optional: false,
      }),
      station: helpers.one.stations({
        from: helpers.stationsPermits.station_id,
        to: helpers.stations.id,
      }),
    },
    extraIdentificators: {
      station: helpers.one.stations({
        from: helpers.extraIdentificators.station_id,
        to: helpers.stations.id,
      }),
    },
    submissions: {
      station: helpers.one.stations({
        from: helpers.submissions.station_id,
        to: helpers.stations.id,
      }),
      submitter: helpers.one.users({
        from: helpers.submissions.submitter_id,
        to: helpers.users.id,
        optional: false,
      }),
      reviewer: helpers.one.users({
        from: helpers.submissions.reviewer_id,
        to: helpers.users.id,
      }),
      proposedStation: helpers.one.proposedStations({
        from: helpers.submissions.id,
        to: helpers.proposedStations.submission_id,
      }),
      proposedLocation: helpers.one.proposedLocations({
        from: helpers.submissions.id,
        to: helpers.proposedLocations.submission_id,
      }),
      proposedSectors: helpers.many.proposedSectors(),
      proposedCells: helpers.many.proposedCells(),
      photos: helpers.many.submissionPhotos(),
      locationPhotoSelections: helpers.many.submissionLocationPhotoSelections(),
    },
    submissionPhotos: {
      submission: helpers.one.submissions({
        from: helpers.submissionPhotos.submission_id,
        to: helpers.submissions.id,
        optional: false,
      }),
    },
    submissionLocationPhotoSelections: {
      submission: helpers.one.submissions({
        from: helpers.submissionLocationPhotoSelections.submission_id,
        to: helpers.submissions.id,
        optional: false,
      }),
      locationPhoto: helpers.one.locationPhotos({
        from: helpers.submissionLocationPhotoSelections.location_photo_id,
        to: helpers.locationPhotos.id,
        optional: false,
      }),
    },

    locationPhotos: {
      location: helpers.one.locations({
        from: helpers.locationPhotos.location_id,
        to: helpers.locations.id,
        optional: false,
      }),
      attachment: helpers.one.attachments({
        from: helpers.locationPhotos.attachment_id,
        to: helpers.attachments.id,
        optional: false,
      }),
      uploadedBy: helpers.one.users({
        from: helpers.locationPhotos.uploaded_by,
        to: helpers.users.id,
      }),
      selections: helpers.many.stationPhotoSelections(),
    },
    stationPhotoSelections: {
      station: helpers.one.stations({
        from: helpers.stationPhotoSelections.station_id,
        to: helpers.stations.id,
        optional: false,
      }),
      locationPhoto: helpers.one.locationPhotos({
        from: helpers.stationPhotoSelections.location_photo_id,
        to: helpers.locationPhotos.id,
        optional: false,
      }),
    },
    proposedStations: {
      submission: helpers.one.submissions({
        from: helpers.proposedStations.submission_id,
        to: helpers.submissions.id,
      }),
    },
    proposedLocations: {
      submission: helpers.one.submissions({
        from: helpers.proposedLocations.submission_id,
        to: helpers.submissions.id,
      }),
    },
    proposedSectors: {
      submission: helpers.one.submissions({
        from: helpers.proposedSectors.submission_id,
        to: helpers.submissions.id,
        optional: false,
      }),
      targetSector: helpers.one.stationSectors({
        from: helpers.proposedSectors.target_sector_id,
        to: helpers.stationSectors.id,
      }),
    },
    proposedCells: {
      submission: helpers.one.submissions({
        from: helpers.proposedCells.submission_id,
        to: helpers.submissions.id,
        optional: false,
      }),
      station: helpers.one.proposedStations({
        from: helpers.proposedCells.station_id,
        to: helpers.proposedStations.id,
      }),
      band: helpers.one.bands({
        from: helpers.proposedCells.band_id,
        to: helpers.bands.id,
        optional: false,
      }),
      targetSector: helpers.one.stationSectors({
        from: helpers.proposedCells.target_sector_id,
        to: helpers.stationSectors.id,
      }),
      gsm: helpers.one.proposedGSMCells({
        from: helpers.proposedCells.id,
        to: helpers.proposedGSMCells.proposed_cell_id,
      }),
      umts: helpers.one.proposedUMTSCells({
        from: helpers.proposedCells.id,
        to: helpers.proposedUMTSCells.proposed_cell_id,
      }),
      lte: helpers.one.proposedLTECells({
        from: helpers.proposedCells.id,
        to: helpers.proposedLTECells.proposed_cell_id,
      }),
      nr: helpers.one.proposedNRCells({
        from: helpers.proposedCells.id,
        to: helpers.proposedNRCells.proposed_cell_id,
      }),
    },
    deletedEntries: {
      import: helpers.one.ukeImportMetadata({
        from: helpers.deletedEntries.import_id,
        to: helpers.ukeImportMetadata.id,
      }),
    },
    statsSnapshots: {
      operator: helpers.one.operators({
        from: helpers.statsSnapshots.operator_id,
        to: helpers.operators.id,
        optional: false,
      }),
      band: helpers.one.bands({
        from: helpers.statsSnapshots.band_id,
        to: helpers.bands.id,
        optional: false,
      }),
    },
  }),
);
