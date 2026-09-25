import type { BaseMessageOptions } from "discord.js";
import { MessageFlags, SeparatorBuilder, TextDisplayBuilder } from "discord.js";

export interface ImportDelta {
  stations: { added: number };
  permits: { added: number; updated: number; deleted: number };
  radiolines: { added: number; deleted: number };
}

export interface SnapshotOperatorDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotBandDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotDelta {
  byOperator: SnapshotOperatorDelta[];
  byBand: SnapshotBandDelta[];
}

export interface ImportCompleteEvent {
  state: "success" | "error";
  startedAt: string;
  finishedAt: string;
  error?: string;
  warning?: string;
  delta?: ImportDelta;
  snapshotDelta?: SnapshotDelta | null;
}

function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function fmtDelta(n: number): string {
  return n >= 0 ? `+${n.toLocaleString("pl-PL")}` : n.toLocaleString("pl-PL");
}

type MessageComponent = NonNullable<BaseMessageOptions["components"]>[number];

export type ImportCompleteMessage = { flags: typeof MessageFlags.IsComponentsV2; components: MessageComponent[] };

export function buildImportCompleteEmbed(event: ImportCompleteEvent): ImportCompleteMessage {
  const components: MessageComponent[] = [];
  const duration = formatDuration(event.startedAt, event.finishedAt);

  components.push(new TextDisplayBuilder().setContent(`### ✅ Import UKE zakończony\n⏱️ Czas trwania: **${duration}**`));

  if (event.error)
    components.push(new TextDisplayBuilder().setContent(`⚠️ **Niektóre etapy importu nie powiodły się**\n\`\`\`${event.error.slice(0, 1000)}\`\`\``));

  if (event.warning) components.push(new TextDisplayBuilder().setContent(`ℹ️ **Uwagi do importu**\n\`\`\`${event.warning.slice(0, 1000)}\`\`\``));

  if (event.delta) {
    const { stations, permits, radiolines } = event.delta;

    const hasChanges =
      stations.added > 0 || permits.added > 0 || permits.updated > 0 || permits.deleted > 0 || radiolines.added > 0 || radiolines.deleted > 0;

    components.push(new SeparatorBuilder());

    if (!hasChanges) {
      components.push(new TextDisplayBuilder().setContent("Nie wykryto żadnych zmian w danych."));
    } else {
      if (stations.added > 0) {
        components.push(new TextDisplayBuilder().setContent(`🏗️ **Stacje**\n+${stations.added} dodanych`));
      }

      if (permits.added > 0 || permits.updated > 0 || permits.deleted > 0) {
        const rows = [
          permits.added > 0 && `+${permits.added.toLocaleString("pl-PL")} nowych`,
          permits.updated > 0 && `~${permits.updated.toLocaleString("pl-PL")} zaktualizowanych`,
          permits.deleted > 0 && `-${permits.deleted.toLocaleString("pl-PL")} usuniętych`,
        ].filter(Boolean);
        components.push(new TextDisplayBuilder().setContent(`📋 **Pozwolenia**\n${rows.join("  ·  ")}`));
      }

      if (radiolines.added > 0 || radiolines.deleted > 0) {
        const rows = [
          radiolines.added > 0 && `+${radiolines.added.toLocaleString("pl-PL")} nowych`,
          radiolines.deleted > 0 && `-${radiolines.deleted.toLocaleString("pl-PL")} usuniętych`,
        ].filter(Boolean);
        components.push(new TextDisplayBuilder().setContent(`📡 **Linie radiowe**\n${rows.join("  ·  ")}`));
      }
    }
  }

  if (event.snapshotDelta) {
    const { byOperator, byBand } = event.snapshotDelta;

    if (byOperator.length > 0) {
      const lines = byOperator.map((op) => `**${op.name}**: ${fmtDelta(op.permitsDelta)} pozwoleń`).join("\n");
      components.push(new SeparatorBuilder(), new TextDisplayBuilder().setContent(`**Według operatora**\n${lines}`.slice(0, 2000)));
    }

    if (byBand.length > 0) {
      const lines = byBand.map((b) => `**${b.name}**: ${fmtDelta(b.permitsDelta)}`).join("\n");
      components.push(new SeparatorBuilder(), new TextDisplayBuilder().setContent(`**Według pasma**\n${lines}`.slice(0, 2000)));
    }
  }

  return { flags: MessageFlags.IsComponentsV2, components };
}
