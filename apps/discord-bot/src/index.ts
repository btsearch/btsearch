import "dotenv/config";
import { Client, Events, GatewayIntentBits, type TextChannel } from "discord.js";
import { createClient } from "redis";

import { getSourceShortNames } from "./api.js";
import { handleImportStatusCommand } from "./commands/import-status.js";
import { handleLocationCommand } from "./commands/location.js";
import { handleSearchCommand, handleSearchSelectMenu } from "./commands/search.js";
import { handleStationCommand, handleStationNavMenu } from "./commands/station.js";
import { type ImportCompleteEvent, buildImportCompleteEmbed } from "./embeds/import-complete.js";

const { DISCORD_TOKEN, REDIS_URL, DISCORD_IMPORT_CHANNEL_ID } = process.env;

if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
if (!REDIS_URL) throw new Error("REDIS_URL is required");
if (!process.env.API_KEY) throw new Error("API_KEY is required");
if (!process.env.API_BASE_URL) throw new Error("API_BASE_URL is required");

const IMPORT_COMPLETE_CHANNEL = "official:import:complete";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const subscriber = createClient({ url: REDIS_URL });
subscriber.on("error", (err: Error) => console.error("[redis:sub]", err));

client.once(Events.ClientReady, async (c) => {
  console.log(`[discord] Logged in as ${c.user.tag}`);

  await subscriber.connect();

  await subscriber.subscribe(IMPORT_COMPLETE_CHANNEL, async (message) => {
    if (!DISCORD_IMPORT_CHANNEL_ID) return;

    let event: ImportCompleteEvent;
    try {
      event = JSON.parse(message) as ImportCompleteEvent;
    } catch {
      console.error("[uke] Failed to parse import complete event");
      return;
    }

    const channel = c.channels.cache.get(DISCORD_IMPORT_CHANNEL_ID) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      console.warn("[uke] Import notification channel not found or not text-based:", DISCORD_IMPORT_CHANNEL_ID);
      return;
    }

    const sourceNames = await getSourceShortNames();
    channel
      .send(buildImportCompleteEmbed(event, sourceNames.get(event.sourceKey) ?? event.sourceKey))
      .catch((err: unknown) => console.error("[uke] Failed to send import embed:", err));
  });

  console.log(`[redis] Subscribed to ${IMPORT_COMPLETE_CHANNEL}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "station":
          await handleStationCommand(interaction);
          break;
        case "search":
          await handleSearchCommand(interaction);
          break;
        case "location":
          await handleLocationCommand(interaction);
          break;
        case "import":
          if (interaction.options.getSubcommand() === "status") await handleImportStatusCommand(interaction);
          break;
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "st:nav") await handleStationNavMenu(interaction);
      else if (interaction.customId === "sr") await handleSearchSelectMenu(interaction);
    }
  } catch (err) {
    console.error("[interaction]", err);
    const reply = { content: "Something went wrong.", ephemeral: true };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => undefined);
      else await interaction.reply(reply).catch(() => undefined);
    }
  }
});

await client.login(DISCORD_TOKEN);
