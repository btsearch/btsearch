import type { BaseMessageOptions } from "discord.js";
import { ButtonBuilder, ButtonStyle, MessageFlags, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from "discord.js";

import type { Brand, LocationWithStations } from "../api.js";
import { stationUrl } from "../api.js";
import { operatorDot, operatorName } from "../utils.js";

type MessageComponent = NonNullable<BaseMessageOptions["components"]>[number];

export type LocationReply = { flags: typeof MessageFlags.IsComponentsV2; components: MessageComponent[] };

export function buildLocationView(location: LocationWithStations, brands: readonly Brand[]): LocationReply {
  const components: MessageComponent[] = [];

  components.push(new TextDisplayBuilder().setContent(`### ${location.address} · ${location.city}`));

  const details = [`🗺️ ${location.region.name}`, `🌐 ${location.latitude.toFixed(5)}°N ${location.longitude.toFixed(5)}°E`];
  components.push(new TextDisplayBuilder().setContent(details.join("\n")));

  components.push(new SeparatorBuilder());

  if (location.stations.length === 0) {
    components.push(new TextDisplayBuilder().setContent("Brak stacji w tej lokalizacji."));
    return { flags: MessageFlags.IsComponentsV2, components };
  }

  const MAX = 20;
  const stationSections = location.stations.slice(0, MAX).map((s) => {
    const opName = operatorName(s.operator, brands);
    const dot = s.operator ? operatorDot(opName) : "";
    const rats = [...new Set(s.cells.map((c) => c.rat.toUpperCase()))].join("/");
    const label = `**${s.siteId}** · ${dot}${opName}${rats ? ` (${rats})` : ""}`;
    const url = stationUrl(s.id, location);

    return new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(label))
      .setButtonAccessory(new ButtonBuilder().setLabel("Zobacz").setStyle(ButtonStyle.Link).setURL(url));
  });

  if (location.stations.length > MAX)
    stationSections.push(
      new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`_i ${location.stations.length - MAX} więcej_`)),
    );

  const header = `**Stacje (${location.stations.length})**`;
  components.push(new TextDisplayBuilder().setContent(header), ...stationSections);

  return { flags: MessageFlags.IsComponentsV2, components };
}
