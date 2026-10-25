import { createReadStream } from "node:fs";

import { readCsvRows } from "../../../core/csv.ts";
import {
  type LocalFile,
  type MicrowaveLinkEnd,
  type MicrowaveLinkRecord,
  type ReadContext,
  type Release,
  WHOLE_DATASET_SLICE,
} from "../../../core/sources.ts";

const SEPARATOR = ",";
const BLANK = "-";
const FIXED_LINKS_PRODUCT = "Fixed Links";
const TRANSMITTER = "T";
const HZ_PER_KHZ = 1000;
const HZ_PER_MHZ = 1_000_000;
const MILLIWATTS_PER_WATT_DB = 30;
const ISSUE_DAY = /^\d{4}-\d{2}-\d{2}/;
const COLUMNS = [
  "Licence Number",
  "License Issue Date",
  "Frequency (Hz)",
  "Station Type",
  "Channel Width (Hz)",
  "Height Above Sea Level",
  "Antenna ERP",
  "Antenna Type",
  "Antenna Gain",
  "Antenna Height",
  "Antenna Polarisation",
  "Licencee Company",
  "Product Description",
  "Latitude(Deg)",
  "Longitude(Deg)",
] as const;

type Column = (typeof COLUMNS)[number];
type Row = (column: Column) => string;
type Station = {
  isTransmitter: boolean;
  frequencyHz: number;
  latitude: number;
  longitude: number;
  row: Row;
};

function valueOrNull(text: string): string | null {
  return text === "" || text === BLANK ? null : text;
}

function numberOrNull(text: string): number | null {
  const value = valueOrNull(text);
  const number = Number(value);
  return value === null || !Number.isFinite(number) ? null : number;
}

function eirpDbmOf(watts: number | null): number | null {
  if (watts === null || watts <= 0) return null;
  return Math.round((10 * Math.log10(watts) + MILLIWATTS_PER_WATT_DB) * 100) / 100;
}

function stationOf(row: Row): Station | null {
  const frequencyHz = numberOrNull(row("Frequency (Hz)"));
  const latitude = numberOrNull(row("Latitude(Deg)"));
  const longitude = numberOrNull(row("Longitude(Deg)"));
  if (frequencyHz === null || latitude === null || longitude === null) return null;

  return { isTransmitter: row("Station Type") === TRANSMITTER, frequencyHz, latitude, longitude, row };
}

function endOf({ latitude, longitude, row }: Station): MicrowaveLinkEnd {
  return {
    longitude,
    latitude,
    groundHeight: numberOrNull(row("Height Above Sea Level")),
    antennaHeight: numberOrNull(row("Antenna Height")),
    city: null,
    province: null,
    street: null,
    locationDescription: null,
  };
}

function linkOf(licenceNumber: string, transmitter: Station, receiver: Station): MicrowaveLinkRecord {
  const { row } = transmitter;
  const channelWidthHz = numberOrNull(row("Channel Width (Hz)"));

  return {
    slice: WHOLE_DATASET_SLICE,
    licensee: valueOrNull(row("Licencee Company")),
    permitNumber: licenceNumber,
    decisionType: null,
    issuedOn: ISSUE_DAY.exec(row("License Issue Date"))?.[0] ?? null,
    expiresOn: null,
    tx: endOf(transmitter),
    rx: endOf(receiver),
    freqKhz: Math.round(transmitter.frequencyHz / HZ_PER_KHZ),
    channelNumber: null,
    channelWidthMhz: channelWidthHz === null ? null : channelWidthHz / HZ_PER_MHZ,
    polarization: valueOrNull(row("Antenna Polarisation")),
    eirpDbm: eirpDbmOf(numberOrNull(row("Antenna ERP"))),
    technical: {
      txAntenna: { type: valueOrNull(row("Antenna Type")), manufacturer: null },
      txAntennaGain: numberOrNull(row("Antenna Gain")),
      rxAntenna: { type: valueOrNull(receiver.row("Antenna Type")), manufacturer: null },
      rxAntennaGain: numberOrNull(receiver.row("Antenna Gain")),
    },
    publishesEveryTechnicalColumn: false,
  };
}

function isOtherEnd(transmitter: Station, receiver: Station): boolean {
  return (
    !receiver.isTransmitter &&
    receiver.frequencyHz === transmitter.frequencyHz &&
    (receiver.latitude !== transmitter.latitude || receiver.longitude !== transmitter.longitude)
  );
}

async function* readRegister(file: LocalFile): AsyncGenerator<Row> {
  let positions: ReadonlyMap<string, number> | null = null;
  for await (const cells of readCsvRows(createReadStream(file.path), SEPARATOR)) {
    if (positions === null) {
      const header = new Map(cells.map((name, position) => [name.trim(), position]));
      const missing = COLUMNS.filter((column) => !header.has(column));
      if (missing.length > 0) throw new Error(`${file.fileName} has no column ${missing.join(", ")}. Its header is: ${cells.join(", ")}`);
      positions = header;
      continue;
    }
    if (cells.length === 1 && cells[0] === "") continue;

    const header = positions;
    yield (column) => (cells[header.get(column)!] ?? "").trim();
  }
}

export async function* parseFixedLinks(ctx: ReadContext, _release: Release, files: readonly LocalFile[]): AsyncGenerator<MicrowaveLinkRecord> {
  const stationsByLicence = new Map<string, Station[]>();
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop
    for await (const row of readRegister(file)) {
      if (row("Product Description") !== FIXED_LINKS_PRODUCT) continue;

      const station = stationOf(row);
      if (station === null) {
        ctx.skip(WHOLE_DATASET_SLICE, "bad_coordinates");
        continue;
      }
      const licenceNumber = row("Licence Number");
      const stations = stationsByLicence.get(licenceNumber);
      if (stations === undefined) stationsByLicence.set(licenceNumber, [station]);
      else stations.push(station);
    }
  }

  for (const [licenceNumber, stations] of stationsByLicence) {
    const pairedReceivers = new Set<Station>();
    for (const transmitter of stations.filter((station) => station.isTransmitter)) {
      const receiver = stations.find((station) => !pairedReceivers.has(station) && isOtherEnd(transmitter, station));
      if (receiver === undefined) {
        ctx.skip(WHOLE_DATASET_SLICE, "unpaired_link");
        continue;
      }
      pairedReceivers.add(receiver);
      yield linkOf(licenceNumber, transmitter, receiver);
    }
    for (const station of stations) if (!station.isTransmitter && !pairedReceivers.has(station)) ctx.skip(WHOLE_DATASET_SLICE, "unpaired_link");
  }
}
