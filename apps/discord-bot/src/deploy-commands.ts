import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
if (!DISCORD_CLIENT_ID) throw new Error("DISCORD_CLIENT_ID is required");

const commands = [
  new SlashCommandBuilder()
    .setName("station")
    .setDescription("Szukaj stacji po ID stacji, np. BT51251")
    .addStringOption((o) => o.setName("id").setDescription("ID stacji (np. 51251)").setRequired(true).setMaxLength(50)),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Szukaj stacji")
    .addStringOption((o) =>
      o
        .setName("query")
        .setDescription("ID stacji, miasto, adres, cell ID, albo filter syntax rat:LTE band:1800")
        .setRequired(true)
        .setMaxLength(200),
    )
    .addStringOption((o) =>
      o
        .setName("rat")
        .setDescription("Radio technology")
        .setRequired(false)
        .addChoices({ name: "GSM", value: "GSM" }, { name: "UMTS", value: "UMTS" }, { name: "LTE", value: "LTE" }, { name: "NR (5G)", value: "NR" }),
    )
    .addIntegerOption((o) => o.setName("band").setDescription("Pasmo (e.g. 900, 1800)").setRequired(false).setMinValue(1))
    .addIntegerOption((o) => o.setName("mnc").setDescription("Kod PLMN (np. 26002)").setRequired(false).setMinValue(1))
    .addStringOption((o) => o.setName("city").setDescription("Miasto").setRequired(false).setMaxLength(100))
    .addStringOption((o) => o.setName("region").setDescription("Województwo (np. MZK)").setRequired(false).setMaxLength(10))
    .addIntegerOption((o) => o.setName("enbid").setDescription("LTE eNodeB ID").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("lac").setDescription("Location Area Code (GSM / UMTS)").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("rnc").setDescription("UMTS RNC ID").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("gnbid").setDescription("NR gNodeB ID").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("cid").setDescription("Cell ID (GSM/UMTS)").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("tac").setDescription("Tracking Area Code (LTE)").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("ecid").setDescription("LTE E-CID (full cell identity)").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("nci").setDescription("NR Cell Identity").setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName("nrtac").setDescription("NR Tracking Area Code").setRequired(false).setMinValue(0))
    .addStringOption((o) => o.setName("address").setDescription("Adres").setRequired(false).setMaxLength(200))
    .addIntegerOption((o) => o.setName("networks_id").setDescription("N! ID").setRequired(false).setMinValue(1))
    .addStringOption((o) => o.setName("networks_name").setDescription("Nazwa NetWorks").setRequired(false).setMaxLength(100))
    .addStringOption((o) => o.setName("mno_name").setDescription("Nazwa MNO").setRequired(false).setMaxLength(100))
    .addStringOption((o) => o.setName("gps").setDescription("GPS (lat,lng) e.g. 52.229,21.012").setRequired(false).setMaxLength(50))
    .addStringOption((o) =>
      o.setName("updated_after").setDescription("Tylko stacje zaktualizowane po tej dacie (YYYY-MM-DD)").setRequired(false).setMaxLength(20),
    )
    .addBooleanOption((o) => o.setName("supports_iot").setDescription("Tylko komórki z obsługą IoT").setRequired(false))
    .addBooleanOption((o) => o.setName("supports_nr_redcap").setDescription("Tylko komórki z obsługą NR RedCap").setRequired(false))
    .addBooleanOption((o) => o.setName("has_photo").setDescription("Tylko stacje z co najmniej jednym zdjęciem").setRequired(false))
    .addBooleanOption((o) => o.setName("is_confirmed").setDescription("Tylko stacje z potwierdzonymi komórkami").setRequired(false)),

  new SlashCommandBuilder()
    .setName("location")
    .setDescription("Pokaż lokalizację i wszystkie stacje na niej")
    .addIntegerOption((o) => o.setName("id").setDescription("Numeryczne ID lokalizacji").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("import")
    .setDescription("Import rejestru")
    .addSubcommand((sub) => sub.setName("status").setDescription("Pokaż status trwającego lub ostatniego importu rejestru")),
];

const rest = new REST().setToken(DISCORD_TOKEN);
const route = DISCORD_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID);
const scope = DISCORD_GUILD_ID ? `guild ${DISCORD_GUILD_ID}` : "global";
console.log(`Registering ${commands.length} slash commands (${scope})...`);

await rest.put(route, { body: commands.map((c) => c.toJSON()) });
console.log("Done.");
