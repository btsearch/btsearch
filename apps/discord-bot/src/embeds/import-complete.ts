import type { BaseMessageOptions } from "discord.js";
import { MessageFlags, SeparatorBuilder, TextDisplayBuilder } from "discord.js";

export interface ImportCompleteDataset {
  key: string;
  outcome: "applied" | "held" | "failed" | "skipped";
  heldSlices: string[];
  error: string | null;
}

export interface ImportChangeCount {
  kind: string;
  count: number;
}

export interface SnapshotOperatorDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotBandDelta {
  id: string;
  name: string;
  permitsDelta: number;
}

export interface SnapshotDelta {
  byOperator: SnapshotOperatorDelta[];
  byBand: SnapshotBandDelta[];
}

export interface ImportCompleteEvent {
  runId: string;
  sourceKey: string;
  trigger: "scheduled" | "manual" | "cli";
  startedAt: string;
  finishedAt: string;
  datasets: ImportCompleteDataset[];
  changes: ImportChangeCount[];
  snapshotDelta: SnapshotDelta | null;
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

export function buildImportCompleteEmbed(event: ImportCompleteEvent, sourceName: string): ImportCompleteMessage {
  const components: MessageComponent[] = [];
  const duration = formatDuration(event.startedAt, event.finishedAt);
  const error = event.datasets
    .filter((dataset) => dataset.error !== null)
    .map((dataset) => `${dataset.key}: ${dataset.error}`)
    .join("; ");
  const warning = event.datasets
    .filter((dataset) => dataset.heldSlices.length > 0)
    .map((dataset) => `${dataset.key}: wstrzymano ${dataset.heldSlices.join(", ")}`)
    .join("; ");

  components.push(new TextDisplayBuilder().setContent(`### ✅ Import ${sourceName} zakończony\n⏱️ Czas trwania: **${duration}**`));

  if (error) {
    components.push(new TextDisplayBuilder().setContent(`⚠️ **Niektóre etapy importu nie powiodły się**\n\`\`\`${error.slice(0, 1000)}\`\`\``));
  }

  if (warning) components.push(new TextDisplayBuilder().setContent(`ℹ️ **Uwagi do importu**\n\`\`\`${warning.slice(0, 1000)}\`\`\``));

  if (event.datasets.some((dataset) => dataset.outcome === "applied")) {
    const countOf = (kind: string) => event.changes.find((change) => change.kind === kind)?.count ?? 0;
    const sitesAdded = countOf("siteAdded");
    const permits = { added: countOf("permitAdded"), deleted: countOf("permitArchived") };
    const microwaveLinks = { added: countOf("microwaveLinkAdded"), deleted: countOf("microwaveLinkArchived") };

    const hasChanges = sitesAdded > 0 || permits.added > 0 || permits.deleted > 0 || microwaveLinks.added > 0 || microwaveLinks.deleted > 0;

    components.push(new SeparatorBuilder());

    if (!hasChanges) {
      components.push(new TextDisplayBuilder().setContent("Nie wykryto żadnych zmian w danych."));
    } else {
      if (sitesAdded > 0) {
        components.push(new TextDisplayBuilder().setContent(`🏗️ **Stacje**\n+${sitesAdded} dodanych`));
      }

      if (permits.added > 0 || permits.deleted > 0) {
        const rows = [
          permits.added > 0 && `+${permits.added.toLocaleString("pl-PL")} nowych`,
          permits.deleted > 0 && `-${permits.deleted.toLocaleString("pl-PL")} usuniętych`,
        ].filter(Boolean);
        components.push(new TextDisplayBuilder().setContent(`📋 **Pozwolenia**\n${rows.join("  ·  ")}`));
      }

      if (microwaveLinks.added > 0 || microwaveLinks.deleted > 0) {
        const rows = [
          microwaveLinks.added > 0 && `+${microwaveLinks.added.toLocaleString("pl-PL")} nowych`,
          microwaveLinks.deleted > 0 && `-${microwaveLinks.deleted.toLocaleString("pl-PL")} usuniętych`,
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
