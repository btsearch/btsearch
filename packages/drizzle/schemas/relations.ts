import { defineRelations } from "drizzle-orm";

import {
  accounts,
  apikeys,
  attachments,
  auditLogs,
  auditOperations,
  hunterRegions,
  jwks,
  locationPhotos,
  notifications,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  officialSiteWatches,
  passkeys,
  pushSubscriptions,
  roleGrantRegions,
  roleGrants,
  sessions,
  stationComments,
  stationPhotoSelections,
  stationWatches,
  twoFactors,
  userLists,
  users,
} from "./auth.ts";
import {
  bands,
  brands,
  cellPlmns,
  cells,
  countries,
  countryBands,
  extraIdentificators,
  gsmCells,
  licensees,
  locations,
  lteCells,
  microwaveLinkAntennaTypes,
  microwaveLinkManufacturers,
  microwaveLinkTransmitterTypes,
  microwaveLinks,
  nrCells,
  officialLocations,
  officialPermitSectors,
  officialPermits,
  officialSites,
  operators,
  plmns,
  regions,
  spectrumHoldings,
  stationBackhauls,
  stationSectors,
  stations,
  stationsOfficialSites,
  statsSnapshots,
  structureOwners,
  umtsCells,
} from "./bts.ts";
import {
  contributorBlocks,
  contributors,
  deviceAttestations,
  deviceAttestedSignatures,
  deviceCertificates,
  deviceModels,
  deviceRevocations,
  devices,
  socs,
  termsAcceptances,
  uploads,
} from "./measurements.ts";
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
    brands,
    cells,
    cellPlmns,
    countries,
    countryBands,
    locations,
    operators,
    plmns,
    structureOwners,
    regions,
    spectrumHoldings,
    stations,
    stationSectors,
    stationBackhauls,
    officialSites,
    officialPermits,
    officialPermitSectors,
    microwaveLinkManufacturers,
    microwaveLinkAntennaTypes,
    microwaveLinkTransmitterTypes,
    microwaveLinks,
    stationsOfficialSites,
    gsmCells,
    umtsCells,
    lteCells,
    nrCells,
    extraIdentificators,
    officialLocations,
    licensees,
    accounts,
    apikeys,
    attachments,
    auditLogs,
    auditOperations,
    jwks,
    notifications,
    oauthAccessTokens,
    oauthClientAssertions,
    oauthClientResources,
    oauthClients,
    oauthConsents,
    oauthRefreshTokens,
    oauthResources,
    passkeys,
    pushSubscriptions,
    roleGrants,
    roleGrantRegions,
    hunterRegions,
    sessions,
    locationPhotos,
    stationComments,
    stationPhotoSelections,
    stationWatches,
    officialSiteWatches,
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
    statsSnapshots,
    socs,
    deviceModels,
    devices,
    deviceAttestations,
    deviceAttestedSignatures,
    deviceCertificates,
    deviceRevocations,
    contributors,
    termsAcceptances,
    contributorBlocks,
    uploads,
  },
  (helpers) => ({
    countries: {
      regions: helpers.many.regions(),
      operators: helpers.many.operators(),
      bandPlan: helpers.many.countryBands(),
    },
    countryBands: {
      country: helpers.one.countries({
        from: helpers.countryBands.countryCode,
        to: helpers.countries.code,
        optional: false,
      }),
      band: helpers.one.bands({
        from: helpers.countryBands.bandId,
        to: helpers.bands.id,
        optional: false,
      }),
    },
    roleGrants: {
      user: helpers.one.users({
        from: helpers.roleGrants.userId,
        to: helpers.users.id,
        alias: "grantee",
        optional: false,
      }),
      grantedBy: helpers.one.users({
        from: helpers.roleGrants.grantedById,
        to: helpers.users.id,
        alias: "grantor",
      }),
      country: helpers.one.countries({
        from: helpers.roleGrants.countryCode,
        to: helpers.countries.code,
        optional: false,
      }),
      regions: helpers.many.roleGrantRegions(),
    },
    roleGrantRegions: {
      grant: helpers.one.roleGrants({
        from: helpers.roleGrantRegions.grantId,
        to: helpers.roleGrants.id,
        optional: false,
      }),
      region: helpers.one.regions({
        from: helpers.roleGrantRegions.regionId,
        to: helpers.regions.id,
        optional: false,
      }),
    },
    hunterRegions: {
      user: helpers.one.users({
        from: helpers.hunterRegions.userId,
        to: helpers.users.id,
        optional: false,
      }),
      region: helpers.one.regions({
        from: helpers.hunterRegions.regionId,
        to: helpers.regions.id,
        optional: false,
      }),
    },
    brands: {
      operators: helpers.many.operators(),
      licensees: helpers.many.licensees(),
      structureOwners: helpers.many.structureOwners(),
    },
    structureOwners: {
      country: helpers.one.countries({
        from: helpers.structureOwners.countryCode,
        to: helpers.countries.code,
      }),
      brand: helpers.one.brands({
        from: helpers.structureOwners.brandId,
        to: helpers.brands.id,
      }),
      operator: helpers.one.operators({
        from: helpers.structureOwners.operatorId,
        to: helpers.operators.id,
      }),
      locations: helpers.many.locations(),
    },
    licensees: {
      brand: helpers.one.brands({
        from: helpers.licensees.brandId,
        to: helpers.brands.id,
      }),
    },
    operators: {
      parent: helpers.one.operators({
        from: helpers.operators.parent_id,
        to: helpers.operators.id,
      }),
      children: helpers.many.operators(),
      country: helpers.one.countries({
        from: helpers.operators.countryCode,
        to: helpers.countries.code,
        optional: false,
      }),
      brand: helpers.one.brands({
        from: helpers.operators.brandId,
        to: helpers.brands.id,
      }),
      stations: helpers.many.stations(),
      officialSites: helpers.many.officialSites(),
      plmns: helpers.many.plmns(),
    },
    regions: {
      country: helpers.one.countries({
        from: helpers.regions.countryCode,
        to: helpers.countries.code,
        optional: false,
      }),
      locations: helpers.many.locations(),
      officialLocations: helpers.many.officialLocations(),
    },
    spectrumHoldings: {
      operator: helpers.one.operators({
        from: helpers.spectrumHoldings.operatorId,
        to: helpers.operators.id,
        optional: false,
      }),
      band: helpers.one.bands({
        from: helpers.spectrumHoldings.bandId,
        to: helpers.bands.id,
        optional: false,
      }),
      region: helpers.one.regions({
        from: helpers.spectrumHoldings.regionId,
        to: helpers.regions.id,
      }),
    },
    locations: {
      region: helpers.one.regions({
        from: helpers.locations.region_id,
        to: helpers.regions.id,
        optional: false,
      }),
      structureOwner: helpers.one.structureOwners({
        from: helpers.locations.structure_owner_id,
        to: helpers.structureOwners.id,
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
      uplink: helpers.one.stationBackhauls({
        from: helpers.stations.id,
        to: helpers.stationBackhauls.station_id,
      }),
      stationWatches: helpers.many.stationWatches(),
    },
    stationSectors: {
      station: helpers.one.stations({
        from: helpers.stationSectors.station_id,
        to: helpers.stations.id,
        optional: false,
      }),
    },
    stationBackhauls: {
      station: helpers.one.stations({
        from: helpers.stationBackhauls.station_id,
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
      plmns: helpers.many.cellPlmns(),
    },
    cellPlmns: {
      cell: helpers.one.cells({
        from: helpers.cellPlmns.cellId,
        to: helpers.cells.id,
        optional: false,
      }),
      plmn: helpers.one.plmns({
        from: helpers.cellPlmns.plmnId,
        to: helpers.plmns.id,
        optional: false,
      }),
    },
    plmns: {
      operator: helpers.one.operators({
        from: helpers.plmns.operatorId,
        to: helpers.operators.id,
        optional: false,
      }),
      cells: helpers.many.cellPlmns(),
    },
    bands: {
      cells: helpers.many.cells(),
      countryPlans: helpers.many.countryBands(),
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
    officialSiteWatches: {
      user: helpers.one.users({
        from: helpers.officialSiteWatches.userId,
        to: helpers.users.id,
      }),
      officialSite: helpers.one.officialSites({
        from: helpers.officialSiteWatches.officialSiteId,
        to: helpers.officialSites.id,
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
      operation: helpers.one.auditOperations({
        from: helpers.auditLogs.operation_id,
        to: helpers.auditOperations.id,
      }),
    },
    auditOperations: {
      actor: helpers.one.users({
        from: helpers.auditOperations.actor_id,
        to: helpers.users.id,
        alias: "actor",
      }),
      performer: helpers.one.users({
        from: helpers.auditOperations.performed_by,
        to: helpers.users.id,
        alias: "performer",
      }),
      entries: helpers.many.auditLogs(),
      reverts: helpers.one.auditOperations({
        from: helpers.auditOperations.reverts_operation_id,
        to: helpers.auditOperations.id,
        alias: "reverts",
      }),
      revertedBy: helpers.one.auditOperations({
        from: helpers.auditOperations.reverted_by_operation_id,
        to: helpers.auditOperations.id,
        alias: "revertedBy",
      }),
    },
    users: {
      accounts: helpers.many.accounts(),
      comments: helpers.many.stationComments(),
      lists: helpers.many.userLists(),
      apiKeys: helpers.many.apikeys(),
      passkeys: helpers.many.passkeys(),
      sessions: helpers.many.sessions(),
      oauthClients: helpers.many.oauthClients(),
      oauthConsents: helpers.many.oauthConsents(),
      twoFactors: helpers.many.twoFactors(),
      attachments: helpers.many.attachments({
        from: helpers.users.id,
        to: helpers.attachments.author_id,
        alias: "author",
      }),
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
      officialSiteWatches: helpers.many.officialSiteWatches(),
      hunterRegions: helpers.many.hunterRegions(),
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
      officialSite: helpers.one.officialSites({
        from: helpers.notifications.officialSiteId,
        to: helpers.officialSites.id,
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
    sessions: {
      user: helpers.one.users({
        from: helpers.sessions.userId,
        to: helpers.users.id,
      }),
    },
    oauthClients: {
      user: helpers.one.users({
        from: helpers.oauthClients.userId,
        to: helpers.users.id,
      }),
      accessTokens: helpers.many.oauthAccessTokens(),
      refreshTokens: helpers.many.oauthRefreshTokens(),
      consents: helpers.many.oauthConsents(),
    },
    oauthAccessTokens: {
      client: helpers.one.oauthClients({
        from: helpers.oauthAccessTokens.clientId,
        to: helpers.oauthClients.clientId,
      }),
      user: helpers.one.users({
        from: helpers.oauthAccessTokens.userId,
        to: helpers.users.id,
      }),
      session: helpers.one.sessions({
        from: helpers.oauthAccessTokens.sessionId,
        to: helpers.sessions.id,
      }),
    },
    oauthRefreshTokens: {
      client: helpers.one.oauthClients({
        from: helpers.oauthRefreshTokens.clientId,
        to: helpers.oauthClients.clientId,
      }),
      user: helpers.one.users({
        from: helpers.oauthRefreshTokens.userId,
        to: helpers.users.id,
      }),
      session: helpers.one.sessions({
        from: helpers.oauthRefreshTokens.sessionId,
        to: helpers.sessions.id,
      }),
    },
    oauthConsents: {
      client: helpers.one.oauthClients({
        from: helpers.oauthConsents.clientId,
        to: helpers.oauthClients.clientId,
      }),
      user: helpers.one.users({
        from: helpers.oauthConsents.userId,
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
    microwaveLinkManufacturers: {
      microwaveLinkAntennaTypes: helpers.many.microwaveLinkAntennaTypes(),
      microwaveLinkTransmitterTypes: helpers.many.microwaveLinkTransmitterTypes(),
    },
    microwaveLinkAntennaTypes: {
      manufacturer: helpers.one.microwaveLinkManufacturers({
        from: helpers.microwaveLinkAntennaTypes.manufacturer_id,
        to: helpers.microwaveLinkManufacturers.id,
      }),
    },
    microwaveLinkTransmitterTypes: {
      manufacturer: helpers.one.microwaveLinkManufacturers({
        from: helpers.microwaveLinkTransmitterTypes.manufacturer_id,
        to: helpers.microwaveLinkManufacturers.id,
        optional: false,
      }),
    },
    microwaveLinks: {
      txTransmitterType: helpers.one.microwaveLinkTransmitterTypes({
        from: helpers.microwaveLinks.tx_transmitter_type_id,
        to: helpers.microwaveLinkTransmitterTypes.id,
        optional: false,
      }),
      txAntennaType: helpers.one.microwaveLinkAntennaTypes({
        from: helpers.microwaveLinks.tx_antenna_type_id,
        to: helpers.microwaveLinkAntennaTypes.id,
        optional: false,
      }),
      rxAntennaType: helpers.one.microwaveLinkAntennaTypes({
        from: helpers.microwaveLinks.rx_antenna_type_id,
        to: helpers.microwaveLinkAntennaTypes.id,
        optional: false,
      }),
      licensee: helpers.one.licensees({
        from: helpers.microwaveLinks.operator_id,
        to: helpers.licensees.id,
        optional: false,
      }),
    },
    officialPermits: {
      officialSite: helpers.one.officialSites({
        from: helpers.officialPermits.official_site_id,
        to: helpers.officialSites.id,
        optional: false,
      }),
      sectors: helpers.many.officialPermitSectors(),
    },
    officialPermitSectors: {
      permit: helpers.one.officialPermits({
        from: helpers.officialPermitSectors.permit_id,
        to: helpers.officialPermits.id,
        optional: false,
      }),
    },
    officialLocations: {
      region: helpers.one.regions({
        from: helpers.officialLocations.region_id,
        to: helpers.regions.id,
        optional: false,
      }),
      officialSites: helpers.many.officialSites(),
    },
    officialSites: {
      operator: helpers.one.operators({
        from: helpers.officialSites.operator_id,
        to: helpers.operators.id,
        optional: false,
      }),
      location: helpers.one.officialLocations({
        from: helpers.officialSites.location_id,
        to: helpers.officialLocations.id,
        optional: false,
      }),
      permits: helpers.many.officialPermits(),
      officialSiteWatches: helpers.many.officialSiteWatches(),
    },
    stationsOfficialSites: {
      officialSite: helpers.one.officialSites({
        from: helpers.stationsOfficialSites.official_site_id,
        to: helpers.officialSites.id,
        optional: false,
      }),
      station: helpers.one.stations({
        from: helpers.stationsOfficialSites.station_id,
        to: helpers.stations.id,
        optional: false,
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
    statsSnapshots: {
      operator: helpers.one.operators({
        from: helpers.statsSnapshots.operator_id,
        to: helpers.operators.id,
        optional: false,
      }),
    },
    socs: {
      deviceModels: helpers.many.deviceModels(),
    },
    deviceModels: {
      soc: helpers.one.socs({
        from: helpers.deviceModels.socId,
        to: helpers.socs.id,
      }),
      devices: helpers.many.devices(),
    },
    devices: {
      user: helpers.one.users({
        from: helpers.devices.userId,
        to: helpers.users.id,
      }),
      model: helpers.one.deviceModels({
        from: helpers.devices.modelId,
        to: helpers.deviceModels.id,
        optional: false,
      }),
      attestation: helpers.one.deviceAttestations({
        from: helpers.devices.id,
        to: helpers.deviceAttestations.deviceId,
      }),
      revocation: helpers.one.deviceRevocations({
        from: helpers.devices.id,
        to: helpers.deviceRevocations.deviceId,
      }),
      certificates: helpers.many.deviceCertificates(),
      attestedSignatures: helpers.many.deviceAttestedSignatures(),
      uploads: helpers.many.uploads(),
    },
    deviceAttestations: {
      device: helpers.one.devices({
        from: helpers.deviceAttestations.deviceId,
        to: helpers.devices.id,
        optional: false,
      }),
    },
    deviceAttestedSignatures: {
      device: helpers.one.devices({
        from: helpers.deviceAttestedSignatures.deviceId,
        to: helpers.devices.id,
        optional: false,
      }),
    },
    deviceCertificates: {
      device: helpers.one.devices({
        from: helpers.deviceCertificates.deviceId,
        to: helpers.devices.id,
        optional: false,
      }),
    },
    deviceRevocations: {
      device: helpers.one.devices({
        from: helpers.deviceRevocations.deviceId,
        to: helpers.devices.id,
        optional: false,
      }),
      revokedBy: helpers.one.users({
        from: helpers.deviceRevocations.revokedById,
        to: helpers.users.id,
      }),
    },
    contributors: {
      user: helpers.one.users({
        from: helpers.contributors.userId,
        to: helpers.users.id,
        optional: false,
      }),
      termsAcceptances: helpers.many.termsAcceptances(),
      block: helpers.one.contributorBlocks({
        from: helpers.contributors.userId,
        to: helpers.contributorBlocks.userId,
      }),
    },
    termsAcceptances: {
      contributor: helpers.one.contributors({
        from: helpers.termsAcceptances.userId,
        to: helpers.contributors.userId,
        optional: false,
      }),
    },
    contributorBlocks: {
      contributor: helpers.one.contributors({
        from: helpers.contributorBlocks.userId,
        to: helpers.contributors.userId,
        optional: false,
      }),
      blockedBy: helpers.one.users({
        from: helpers.contributorBlocks.blockedById,
        to: helpers.users.id,
      }),
    },
    uploads: {
      device: helpers.one.devices({
        from: helpers.uploads.deviceId,
        to: helpers.devices.id,
        optional: false,
      }),
    },
  }),
);
