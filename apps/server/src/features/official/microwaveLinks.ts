import {
  microwaveLinkAntennaTypes,
  microwaveLinkManufacturers,
  microwaveLinkTransmitterTypes,
  microwaveLinks,
  officialDatasets,
  officialSources,
} from "@openbts/drizzle";
import type {
  Licensee,
  MicrowaveLink,
  MicrowaveLinkEquipment,
  MicrowaveLinkInclude,
  MicrowaveLinkList,
  MicrowaveLinkListQuery,
  MicrowaveLinkSort,
  Paging,
} from "@openbts/shared/contract";
import { type SQL, and, count, eq, gte, inArray, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { type SortColumn, type SortField, createKeyset } from "../../lib/keyset.js";
import { bboxCondition } from "../stations/read.js";
import { linkKindMatches, permitNumberMatches } from "./filters.js";
import { fetchLicensees } from "./licensees.js";
import { listMicrowaveLinkIds } from "./lists.js";
import { DATASET_PERMIT_KINDS, type DatasetPermitKind, toPermitKind } from "./serialize.js";
import { type OfficialVisibility, loadOfficialVisibility, officialSourceIsPublic } from "./visibility.js";

const linkSelectSchema = createSelectSchema(microwaveLinks);

type LinkRow = z.infer<typeof linkSelectSchema>;
type LinkRows = { link: LinkRow; sourceKey: string; datasetKind: DatasetPermitKind };
type EquipmentById = ReadonlyMap<number, MicrowaveLinkEquipment>;
type Equipment = { antennas: EquipmentById; transmitters: EquipmentById };

const SORT_COLUMNS: Record<SortField<MicrowaveLinkSort>, SortColumn | null> = {
  id: null,
  createdAt: { column: microwaveLinks.createdAt, kind: "instant" },
  updatedAt: { column: microwaveLinks.updatedAt, kind: "instant" },
};

const txPoint = sql`ST_SetSRID(ST_MakePoint(${microwaveLinks.tx_longitude}, ${microwaveLinks.tx_latitude}), 4326)`;
const rxPoint = sql`ST_SetSRID(ST_MakePoint(${microwaveLinks.rx_longitude}, ${microwaveLinks.rx_latitude}), 4326)`;
const ofDataset = eq(officialDatasets.id, microwaveLinks.dataset_id);
const ofSource = eq(officialSources.id, officialDatasets.sourceId);

function linkConditions(query: MicrowaveLinkListQuery, visibility: OfficialVisibility, listedLinkIds: readonly number[] | null): (SQL | undefined)[] {
  const { q, permitNumbers, licenseeIds, sourceKeys, kinds, createdAfter, bbox } = query;

  return [
    officialSourceIsPublic(officialSources.id, visibility),
    q === undefined ? undefined : permitNumberMatches(microwaveLinks.permit_number, q),
    permitNumbers ? inArray(microwaveLinks.permit_number, permitNumbers) : undefined,
    licenseeIds ? inArray(microwaveLinks.operator_id, licenseeIds) : undefined,
    sourceKeys ? inArray(officialSources.key, sourceKeys) : undefined,
    kinds ? linkKindMatches(kinds) : undefined,
    createdAfter ? gte(microwaveLinks.createdAt, new Date(createdAfter)) : undefined,
    bbox ? or(bboxCondition(txPoint, bbox), bboxCondition(rxPoint, bbox)) : undefined,
    listedLinkIds ? inArray(microwaveLinks.id, [...listedLinkIds]) : undefined,
  ];
}

async function loadEquipment(
  table: typeof microwaveLinkAntennaTypes | typeof microwaveLinkTransmitterTypes,
  ids: readonly number[],
): Promise<EquipmentById> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: table.id, name: table.name, manufacturerId: microwaveLinkManufacturers.id, manufacturerName: microwaveLinkManufacturers.name })
    .from(table)
    .leftJoin(microwaveLinkManufacturers, eq(microwaveLinkManufacturers.id, table.manufacturer_id))
    .where(inArray(table.id, [...ids]));
  return new Map(
    rows.map(({ id, name, manufacturerId, manufacturerName }) => [
      id,
      { id, name, manufacturer: manufacturerId === null || manufacturerName === null ? null : { id: manufacturerId, name: manufacturerName } },
    ]),
  );
}

function equipmentOf(equipment: EquipmentById, id: number | null): MicrowaveLinkEquipment | null {
  return id === null ? null : (equipment.get(id) ?? null);
}

function toMicrowaveLink({ link, sourceKey, datasetKind }: LinkRows, { antennas, transmitters }: Equipment): MicrowaveLink {
  return {
    id: link.id,
    sourceKey,
    licenseeId: link.operator_id,
    permit: {
      number: link.permit_number,
      kind: link.decision_type === null ? DATASET_PERMIT_KINDS[datasetKind] : toPermitKind(link.decision_type),
      issuedOn: link.issue_date,
      expiresOn: link.expiry_date,
    },
    frequencyMhz: link.freq_khz / 1000,
    channelNumber: link.ch_num,
    channelWidthMhz: link.ch_width,
    planSymbol: link.plan_symbol,
    polarization: link.polarization,
    modulation: link.modulation_type,
    capacity: link.bandwidth,
    specsAsOf: link.specs_date?.toISOString() ?? null,
    tx: {
      latitude: link.tx_latitude,
      longitude: link.tx_longitude,
      groundHeightMeters: link.tx_height,
      city: link.tx_city,
      province: link.tx_province,
      street: link.tx_street,
      locationDescription: link.tx_location_description,
      antenna: equipmentOf(antennas, link.tx_antenna_type_id),
      antennaGainDbi: link.tx_antenna_gain,
      antennaHeightMeters: link.tx_antenna_height,
      eirpDbm: link.tx_eirp,
      transmitter: equipmentOf(transmitters, link.tx_transmitter_type_id),
    },
    rx: {
      latitude: link.rx_latitude,
      longitude: link.rx_longitude,
      groundHeightMeters: link.rx_height,
      city: link.rx_city,
      province: link.rx_province,
      street: link.rx_street,
      locationDescription: link.rx_location_description,
      antenna: equipmentOf(antennas, link.rx_antenna_type_id),
      antennaGainDbi: link.rx_antenna_gain,
      antennaHeightMeters: link.rx_antenna_height,
      antennaAttenuationDb: link.tx_antenna_attenuation,
      noiseFigureDb: link.rx_noise_figure,
      atpcAttenuationDb: link.rx_atpc_attenuation,
    },
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

async function serializeLinks(rows: readonly LinkRows[], include: readonly MicrowaveLinkInclude[]): Promise<MicrowaveLink[]> {
  const links = rows.map(({ link }) => link);
  const [antennas, transmitters, licensees] = await Promise.all([
    loadEquipment(microwaveLinkAntennaTypes, unique(links.flatMap((link) => [link.tx_antenna_type_id, link.rx_antenna_type_id]))),
    loadEquipment(microwaveLinkTransmitterTypes, unique(links.map((link) => link.tx_transmitter_type_id))),
    include.includes("licensee") ? fetchLicensees(unique(links.map((link) => link.operator_id))) : null,
  ]);
  const licenseesById = new Map(licensees?.map((licensee): [number, Licensee] => [licensee.id, licensee]));

  return rows.map((row) => {
    const link = toMicrowaveLink(row, { antennas, transmitters });
    if (licensees) link.licensee = link.licenseeId === null ? null : (licenseesById.get(link.licenseeId) ?? null);
    return link;
  });
}

export async function fetchMicrowaveLinkPage(req: FastifyRequest, query: MicrowaveLinkListQuery): Promise<MicrowaveLinkList> {
  const { include = [], sort, limit, cursor, offset, includeTotal, listId } = query;
  const [visibility, listedLinkIds] = await Promise.all([loadOfficialVisibility(req), listMicrowaveLinkIds(req, listId)]);
  if (visibility.sourceIds?.length === 0 || listedLinkIds?.length === 0) {
    return { data: [], paging: includeTotal ? { limit, nextCursor: null, total: 0 } : { limit, nextCursor: null } };
  }

  const filters = and(...linkConditions(query, visibility, listedLinkIds));
  const keyset = createKeyset(sort, microwaveLinks.id, SORT_COLUMNS, cursor);
  const [rows, totals] = await Promise.all([
    db
      .select({ link: microwaveLinks, sourceKey: officialSources.key, datasetKind: officialDatasets.permitKind, key: keyset.key })
      .from(microwaveLinks)
      .innerJoin(officialDatasets, ofDataset)
      .innerJoin(officialSources, ofSource)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal
      ? db.select({ total: count() }).from(microwaveLinks).innerJoin(officialDatasets, ofDataset).innerJoin(officialSources, ofSource).where(filters)
      : null,
  ]);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.link.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return { data: await serializeLinks(page, include), paging };
}

export async function readMicrowaveLink(req: FastifyRequest, id: number, include: readonly MicrowaveLinkInclude[]): Promise<MicrowaveLink> {
  const visibility = await loadOfficialVisibility(req);
  const [row] = await db
    .select({ link: microwaveLinks, sourceKey: officialSources.key, datasetKind: officialDatasets.permitKind })
    .from(microwaveLinks)
    .innerJoin(officialDatasets, ofDataset)
    .innerJoin(officialSources, ofSource)
    .where(and(eq(microwaveLinks.id, id), officialSourceIsPublic(officialSources.id, visibility)))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const [link] = await serializeLinks([row], include);
  return link!;
}
