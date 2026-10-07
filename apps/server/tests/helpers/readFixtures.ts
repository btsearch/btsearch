export const readDate = new Date("2026-10-06T10:00:00.000Z");
export const readUserId = "123e4567-e89b-42d3-a456-426614174000";

export const readStation = {
  id: 1,
  station_id: "Łódź-1",
  operator_id: null,
  location_id: null,
  status: "published",
  is_confirmed: true,
  notes: null,
  createdAt: readDate,
  updatedAt: readDate,
  statusChangedAt: readDate,
};

export const readLocation = {
  location: {
    id: 1,
    region_id: 1,
    city: "Łódź",
    address: "Main Street 1",
    structure_type: null,
    structure_owner_id: null,
    structure_note: null,
    latitude: 52,
    longitude: 21,
    createdAt: readDate,
    updatedAt: readDate,
  },
  region: { id: 1, countryCode: "PL", code: "LD", name: "Łódzkie", isoCode: "PL-10" },
  owner: null,
};

export const readPhoto = {
  locationPhotoId: 1,
  fileId: "123e4567-e89b-42d3-a456-426614174001",
  locationId: 1,
  width: 2048,
  height: 1365,
  hasThumb: false,
  hasFull: false,
  note: "Lorem ipsum",
  takenAt: null,
  createdAt: readDate,
  authorId: readUserId,
  authorUsername: "tester",
  authorName: "Private Name",
  authorImage: null,
  authorVisibility: "private",
};

export const readCell = {
  cell: {
    id: 1,
    station_id: 1,
    band_id: 3,
    sector_id: null,
    type: "MACROCELL",
    rat: "LTE",
    is_confirmed: true,
    notes: null,
    createdAt: readDate,
    updatedAt: readDate,
  },
  gsm: null,
  umts: null,
  lte: { enbid: 100, clid: 1, ecid: 25601, tac: 0, pci: 0, earfcn: 1300, supports_iot: false },
  nr: null,
  station: readStation,
};
