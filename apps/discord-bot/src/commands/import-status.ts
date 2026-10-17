import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, SeparatorBuilder, TextDisplayBuilder } from "discord.js";

import { type ImportRunDataset, type ImportRunDetail, type ImportRunStep, getLatestImportRuns, getSourceShortNames } from "../api.js";

const V2 = MessageFlags.IsComponentsV2 as const;

const STEP_EMOJI: Record<string, string> = {
  success: "✅",
  skipped: "⏭️",
  running: "⏳",
  error: "❌",
  pending: "🔲",
};

interface ImportStep {
  key: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function datasetStatus(run: ImportRunDetail, dataset: ImportRunDataset): string {
  if (dataset.error !== null) return "error";
  if (run.slices.some((slice) => slice.datasetId === dataset.datasetId && slice.outcome === "applied")) return "success";
  const isReadingDatasets = run.steps.length === 0 && (run.status === "queued" || run.status === "running");
  return isReadingDatasets ? "pending" : "skipped";
}

function afterStepStatus(step: ImportRunStep): string {
  if (step.error !== null) return "error";
  return step.finishedAt === null ? "running" : "success";
}

function importSteps(run: ImportRunDetail): ImportStep[] {
  return [
    ...run.datasets.map((dataset) => ({ key: dataset.datasetKey, status: datasetStatus(run, dataset), startedAt: null, finishedAt: null })),
    ...run.steps.map((step) => ({ key: step.step, status: afterStepStatus(step), startedAt: step.startedAt, finishedAt: step.finishedAt })),
  ];
}

function runState(run: ImportRunDetail): string {
  if (run.status === "queued") return "idle";
  if (run.status === "failed") return "error";
  if (run.status === "done") return run.datasets.some((dataset) => dataset.error !== null) ? "error" : "success";
  return run.status;
}

function runError(run: ImportRunDetail): string {
  return [
    run.error,
    ...run.datasets.map((dataset) => dataset.error && `${dataset.datasetKey}: ${dataset.error}`),
    ...run.steps.map((step) => step.error && `${step.step}: ${step.error}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function stepDuration(step: ImportStep): string {
  if (!step.startedAt || !step.finishedAt) return "";
  const ms = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
  return ` (${(ms / 1000).toFixed(1)}s)`;
}

function getStateLabel(state: string): string {
  if (state === "idle") return "Oczekiwanie";
  if (state === "running") return "Trwa";
  if (state === "success") return "Sukces";
  if (state === "error") return "Błąd";
  if (state === "cancelled") return "Anulowano";
  return "Nieznany";
}

function getStateIcon(state: string): string {
  if (state === "success") return "✅";
  if (state === "error") return "❌";
  if (state === "running") return "⏳";
  return "🔲";
}

function runComponents(run: ImportRunDetail, sourceName: string): (TextDisplayBuilder | SeparatorBuilder)[] {
  const state = runState(run);
  const stateLabel = getStateLabel(state);
  const stateIcon = getStateIcon(state);

  const components = [];

  const headerLines = [`### ${stateIcon} Import ${sourceName} - ${stateLabel}`];
  if (run.startedAt) headerLines.push(`▶️ Rozpoczęto: <t:${Math.floor(new Date(run.startedAt).getTime() / 1000)}:R>`);
  if (run.finishedAt) headerLines.push(`🏁 Zakończono: <t:${Math.floor(new Date(run.finishedAt).getTime() / 1000)}:R>`);
  components.push(new TextDisplayBuilder().setContent(headerLines.join("\n")));

  const activeSteps = importSteps(run).filter((s) => s.status !== "pending");
  if (activeSteps.length > 0) {
    components.push(new SeparatorBuilder());
    const stepLines = activeSteps.map((s) => `${STEP_EMOJI[s.status] ?? "❓"} **${s.key}**${stepDuration(s)}`);
    components.push(new TextDisplayBuilder().setContent(stepLines.join("\n")));
  }

  const error = runError(run);
  if (error) {
    components.push(new SeparatorBuilder());
    components.push(new TextDisplayBuilder().setContent(`**Błąd**\n\`\`\`${error.slice(0, 500)}\`\`\``));
  }

  return components;
}

export async function handleImportStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const [runs, sourceNames] = await Promise.all([getLatestImportRuns(), getSourceShortNames()]);
  if (runs.length === 0) {
    await interaction.editReply({
      flags: V2,
      components: [new TextDisplayBuilder().setContent("Żaden import nie został uruchomiony.")],
    });
    return;
  }

  const components = runs.flatMap((run, index) => [
    ...(index > 0 ? [new SeparatorBuilder()] : []),
    ...runComponents(run, sourceNames.get(run.sourceKey) ?? run.sourceKey),
  ]);

  await interaction.editReply({ flags: V2, components });
}
