import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";

import { getBrands, getStation, getStationEmfReports, getStationPhotos, searchStations } from "../api.js";
import { buildSearchView } from "../embeds/search.js";
import { buildStationView } from "../embeds/station.js";

function buildQuery(interaction: ChatInputCommandInteraction): string {
  const parts: string[] = [interaction.options.getString("query", true)];

  const rat = interaction.options.getString("rat");
  if (rat) parts.push(`rat:${rat}`);

  const band = interaction.options.getInteger("band");
  if (band !== null) parts.push(`band:${band}`);

  const mnc = interaction.options.getInteger("mnc");
  if (mnc !== null) parts.push(`mnc:${mnc}`);

  const city = interaction.options.getString("city");
  if (city) parts.push(`city:"${city}"`);

  const region = interaction.options.getString("region");
  if (region) parts.push(`region:${region}`);

  const enbid = interaction.options.getInteger("enbid");
  if (enbid !== null) parts.push(`enbid:${enbid}`);

  const lac = interaction.options.getInteger("lac");
  if (lac !== null) parts.push(`lac:${lac}`);

  const rnc = interaction.options.getInteger("rnc");
  if (rnc !== null) parts.push(`rnc:${rnc}`);

  const gnbid = interaction.options.getInteger("gnbid");
  if (gnbid !== null) parts.push(`gnbid:${gnbid}`);

  const cid = interaction.options.getInteger("cid");
  if (cid !== null) parts.push(`cid:${cid}`);

  const tac = interaction.options.getInteger("tac");
  if (tac !== null) parts.push(`tac:${tac}`);

  const ecid = interaction.options.getInteger("ecid");
  if (ecid !== null) parts.push(`ecid:${ecid}`);

  const nci = interaction.options.getInteger("nci");
  if (nci !== null) parts.push(`nci:${nci}`);

  const nrtac = interaction.options.getInteger("nrtac");
  if (nrtac !== null) parts.push(`nrtac:${nrtac}`);

  const address = interaction.options.getString("address");
  if (address) parts.push(`address:"${address}"`);

  const networksId = interaction.options.getInteger("networks_id");
  if (networksId !== null) parts.push(`networks_id:${networksId}`);

  const networksName = interaction.options.getString("networks_name");
  if (networksName) parts.push(`networks_name:"${networksName}"`);

  const mnoName = interaction.options.getString("mno_name");
  if (mnoName) parts.push(`mno_name:"${mnoName}"`);

  const gps = interaction.options.getString("gps");
  if (gps) parts.push(`gps:${gps}`);

  const updatedAfter = interaction.options.getString("updated_after");
  if (updatedAfter) parts.push(`updated_after:${updatedAfter}`);

  const supportsIot = interaction.options.getBoolean("supports_iot");
  if (supportsIot !== null) parts.push(`supports_iot:${supportsIot}`);

  const supportsNrRedcap = interaction.options.getBoolean("supports_nr_redcap");
  if (supportsNrRedcap !== null) parts.push(`supports_nr_redcap:${supportsNrRedcap}`);

  const hasPhoto = interaction.options.getBoolean("has_photo");
  if (hasPhoto !== null) parts.push(`has_photo:${hasPhoto}`);

  const isConfirmed = interaction.options.getBoolean("is_confirmed");
  if (isConfirmed !== null) parts.push(`is_confirmed:${isConfirmed}`);

  return parts.join(" ");
}

export async function handleSearchCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = buildQuery(interaction);
  await interaction.deferReply();

  let results;
  try {
    results = await searchStations(query);
  } catch {
    await interaction.editReply({ content: "Search failed. Please try again." });
    return;
  }

  if (results.length === 0) {
    await interaction.editReply(buildSearchView(query, [], []));
    return;
  }

  if (results.length === 1) {
    const stationId = results[0]!.id;
    const [station, photos, pem, brands] = await Promise.all([
      getStation(stationId).catch(() => null),
      getStationPhotos(stationId).catch(() => []),
      getStationEmfReports(stationId).catch(() => []),
      getBrands(),
    ]);
    if (!station) {
      await interaction.editReply(buildSearchView(query, results, brands));
      return;
    }
    await interaction.editReply(buildStationView(station, photos, brands, pem[0]?.url));
    return;
  }

  await interaction.editReply(buildSearchView(query, results, await getBrands()));
}

export async function handleSearchSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const stationId = Number(interaction.values[0]);
  await interaction.deferUpdate();

  let station;
  try {
    station = await getStation(stationId);
  } catch {
    await interaction.editReply({ content: "Station not found.", embeds: [], components: [] });
    return;
  }

  const [photos, pem, brands] = await Promise.all([
    getStationPhotos(stationId).catch(() => []),
    getStationEmfReports(stationId).catch(() => []),
    getBrands(),
  ]);

  await interaction.editReply(buildStationView(station, photos, brands, pem[0]?.url));
}
