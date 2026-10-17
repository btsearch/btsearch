import type { ChatInputCommandInteraction } from "discord.js";

import { getBrands, getLocation } from "../api.js";
import { buildLocationView } from "../embeds/location.js";

export async function handleLocationCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  await interaction.deferReply();

  const [location, brands] = await Promise.all([getLocation(id).catch(() => null), getBrands()]);
  if (!location) {
    await interaction.editReply({ content: `Lokalizacja o ID **${id}** nie została znaleziona.` });
    return;
  }

  await interaction.editReply(buildLocationView(location, brands));
}
