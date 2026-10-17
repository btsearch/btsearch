import type { BaseMessageOptions } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";

import type { Brand, Cell, Photo, Station } from "../api.js";
import { photoUrl, stationUrl } from "../api.js";
import { operatorDot, operatorName } from "../utils.js";

function ratSummary(cells: Cell[]): string {
  const counts: Record<string, number> = {};
  for (const cell of cells) counts[cell.rat] = (counts[cell.rat] ?? 0) + 1;
  return Object.entries(counts)
    .map(([rat, n]) => `**${rat.toUpperCase()}**: ${n}`)
    .join(" · ");
}

function identifierOf(station: Station, kind: string): string | undefined {
  return station.identifiers.find((identifier) => identifier.kind === kind)?.value;
}

function stationHeader(station: Station): string {
  const mnoName = identifierOf(station, "operatorName");
  return `### ${station.siteId} ${mnoName ? `(${mnoName})` : ""}`;
}

type MessageComponent = NonNullable<BaseMessageOptions["components"]>[number];

export type StationReply = { flags: typeof MessageFlags.IsComponentsV2; components: MessageComponent[] };

export function buildStationNav(
  stationId: number,
  photos: Photo[],
  current: "station" | "cells" | "photos",
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setValue(`s:${stationId}`)
      .setLabel("Informacje")
      .setEmoji("🗼")
      .setDefault(current === "station"),
  ];

  if (photos.length > 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setValue(`p:${stationId}`)
        .setLabel(`Zdjęcia (${photos.length})`)
        .setEmoji("📷")
        .setDefault(current === "photos"),
    );
  }

  options.push(
    new StringSelectMenuOptionBuilder()
      .setValue(`c:${stationId}`)
      .setLabel("Komórki")
      .setEmoji("📡")
      .setDefault(current === "cells"),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("st:nav").setPlaceholder("Nawiguj").addOptions(options),
  );
}

export function buildStationView(station: Station, photos: Photo[], brands: readonly Brand[], pemUrl?: string): StationReply {
  const mainPhoto = photos.find((p) => p.selections.some((selection) => selection.stationId === station.id && selection.isMain)) ?? photos[0];
  const { location } = station;
  const opName = operatorName(station.operator, brands);

  const components: MessageComponent[] = [];

  if (mainPhoto) components.push(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(photoUrl(mainPhoto))));

  components.push(new TextDisplayBuilder().setContent(stationHeader(station)));

  const details = [`${operatorDot(opName)}${opName}${location ? ` · ${location.region.name}` : ""}`];
  if (location) details.push(`📍 ${location.city}, ${location.address}`, `🌐 ${location.latitude.toFixed(5)}°N ${location.longitude.toFixed(5)}°E`);
  if (station.cells.length > 0) details.push(`📶 ${ratSummary(station.cells)}`);

  const networksName = identifierOf(station, "networksName");
  const networksId = identifierOf(station, "networksId");
  if (networksName !== undefined || networksId !== undefined) {
    const id = networksId !== undefined ? ` (N!${networksId})` : "";
    details.push(`NetWorks: **${networksName ?? ""}${id}**`);
  }

  components.push(new TextDisplayBuilder().setContent(details.join("\n")));

  if (station.notes) components.push(new TextDisplayBuilder().setContent(`> ${station.notes}`));

  if (location) {
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("Zobacz na BTSearch"))
        .setButtonAccessory(new ButtonBuilder().setLabel("Otwórz").setStyle(ButtonStyle.Link).setURL(stationUrl(station.id, location))),
    );
  }

  if (pemUrl) {
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("SI2PEM raport"))
        .setButtonAccessory(new ButtonBuilder().setLabel("Otwórz").setStyle(ButtonStyle.Link).setURL(pemUrl)),
    );
  }

  components.push(new SeparatorBuilder(), buildStationNav(station.id, photos, "station"));

  return { flags: MessageFlags.IsComponentsV2, components };
}

function formatCellDetails(cell: Cell): string {
  switch (cell.rat) {
    case "gsm":
      return `CID: ${cell.cid} · LAC: ${cell.lac}${cell.isEGsm ? " · E-GSM" : ""}`;
    case "umts": {
      const parts: string[] = [];
      if (cell.rnc !== null) parts.push(`RNC: ${cell.rnc}`);
      if (cell.cid !== null) parts.push(`CID: ${cell.cid}`);
      if (cell.longCid !== null) parts.push(`LongCID: ${cell.longCid}`);
      if (cell.lac !== null) parts.push(`LAC: ${cell.lac}`);
      return parts.join(" · ");
    }
    case "lte": {
      const parts: string[] = [];
      if (cell.enbid !== null) parts.push(`eNBID: ${cell.enbid}`);
      if (cell.clid !== null) parts.push(`CLID: ${cell.clid}`);
      if (cell.eci !== null) parts.push(`E-CID: ${cell.eci}`);
      if (cell.tac !== null) parts.push(`TAC: ${cell.tac}`);
      if (cell.pci !== null) parts.push(`PCI: ${cell.pci}`);
      if (cell.supportsIot) parts.push("IoT");
      return parts.join(" · ");
    }
    case "nr": {
      const parts: string[] = [];
      if (cell.gnbid !== null) parts.push(`gNBID: ${cell.gnbid}`);
      if (cell.clid !== null) parts.push(`CLID: ${cell.clid}`);
      if (cell.tac !== null) parts.push(`NR-TAC: ${cell.tac}`);
      if (cell.nci !== null) parts.push(`NCI: ${cell.nci}`);
      if (cell.pci !== null) parts.push(`PCI: ${cell.pci}`);
      parts.push(cell.mode.toUpperCase());
      if (cell.supportsRedCap) parts.push("RedCap");
      return parts.join(" · ");
    }
  }
}

export function buildPhotosView(station: Station, photos: Photo[]): StationReply {
  const gallery = new MediaGalleryBuilder().addItems(...photos.slice(0, 10).map((p) => new MediaGalleryItemBuilder().setURL(photoUrl(p))));

  const header = stationHeader(station);

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [new TextDisplayBuilder().setContent(header), gallery, new SeparatorBuilder(), buildStationNav(station.id, photos, "photos")],
  };
}

export function buildCellsView(station: Station, photos: Photo[]): StationReply {
  const components: MessageComponent[] = [new TextDisplayBuilder().setContent(stationHeader(station)), new SeparatorBuilder()];

  if (station.cells.length === 0) {
    components.push(new TextDisplayBuilder().setContent("Brak zarejestrowanych komórek."));
  } else {
    const byRat = new Map<string, Cell[]>();
    for (const cell of station.cells) {
      const group = byRat.get(cell.rat) ?? [];
      group.push(cell);
      byRat.set(cell.rat, group);
    }

    const RAT_ORDER = ["gsm", "umts", "lte", "nr"] as const;
    const MAX = 10;
    for (const rat of RAT_ORDER) {
      const cells = byRat.get(rat);
      if (!cells?.length) continue;

      const lines = cells.map((c) => `${c.band?.name.replace(new RegExp(`^${rat}\\s*`, "i"), "") ?? "?"} - ${formatCellDetails(c)}`);
      const display = lines.length > MAX ? [...lines.slice(0, MAX), `_i ${lines.length - MAX} więcej_`] : lines;

      components.push(new TextDisplayBuilder().setContent(`**${rat.toUpperCase()}**\n${display.join("\n")}`));
    }
  }

  components.push(new SeparatorBuilder(), buildStationNav(station.id, photos, "cells"));

  return { flags: MessageFlags.IsComponentsV2, components };
}
