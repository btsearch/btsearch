import type { StatsOperator } from "../../features/stats/schemas.ts";
import type { DatabaseMonthlyStats } from "./data.ts";
import {
  type Formatters,
  LOCALES,
  type Language,
  OPERATOR_METRICS,
  type OperatorMetricKey,
  compareBandNames,
  compareOperators,
  createFormatters,
  localizedMonth,
} from "./format.ts";

type Forms = { one: string; few: string; many: string };
type MetricLabels = { emoji: string; title: string; noun: Forms; added: Forms };
type OperatorMetric = (typeof OPERATOR_METRICS)[number];
type Labels = {
  title: (month: string, year: string) => string;
  period: (from: string, to: string) => string;
  monthOverMonth: string;
  contributors: string;
  submissions: string;
  submitted: Forms;
  approved: Forms;
  rejected: Forms;
  total: (value: string) => string;
  byOperator: string;
  byTechnology: string;
  byBand: string;
  metrics: Record<OperatorMetricKey, MetricLabels>;
};
type GroupRow = { operator: StatsOperator; stations_added: number; cells_added: number };
type GroupSummary = { name: string; stationsAdded: number; cellsAdded: number; operators: { operator: StatsOperator; stationsAdded: number }[] };

const SEPARATOR = "  ·  ";
const TECHNOLOGY_ORDER = ["NR", "LTE", "UMTS", "GSM", "GSM-R", "IOT"];

function sameForm(form: string): Forms {
  return { one: form, few: form, many: form };
}

function englishForms(one: string, other: string): Forms {
  return { one, few: other, many: other };
}

const POLISH_FEMININE_NEW: Forms = { one: "nowa", few: "nowe", many: "nowych" };
const POLISH_NEUTER_NEW: Forms = { one: "nowe", few: "nowe", many: "nowych" };
const POLISH_MASCULINE_NEW: Forms = { one: "nowy", few: "nowe", many: "nowych" };

const LABELS: Record<Language, Labels> = {
  pl: {
    title: (month, year) => `📊 Baza danych: ${month} ${year}`,
    period: (from, to) => `📅 Dane od **${from}** do **${to}**`,
    monthOverMonth: "m/m",
    contributors: "👥 **Kontrybutorzy**",
    submissions: "📨 **Zgłoszenia**",
    submitted: { one: "wysłane", few: "wysłane", many: "wysłanych" },
    approved: { one: "zatwierdzone", few: "zatwierdzone", many: "zatwierdzonych" },
    rejected: { one: "odrzucone", few: "odrzucone", many: "odrzuconych" },
    total: (value) => `łącznie ${value}`,
    byOperator: "**Według operatora**",
    byTechnology: "**Według technologii**",
    byBand: "**Według pasma**",
    metrics: {
      stations: { emoji: "🏗️", title: "Stacje", noun: { one: "stacja", few: "stacje", many: "stacji" }, added: POLISH_FEMININE_NEW },
      cells: { emoji: "📶", title: "Komórki", noun: { one: "komórka", few: "komórki", many: "komórek" }, added: POLISH_FEMININE_NEW },
      pcis: { emoji: "🔢", title: "PCI", noun: sameForm("PCI"), added: POLISH_NEUTER_NEW },
      azimuths: { emoji: "🧭", title: "Azymuty", noun: { one: "azymut", few: "azymuty", many: "azymutów" }, added: POLISH_MASCULINE_NEW },
      networks_ids: { emoji: "🆔", title: "NetWorks ID", noun: sameForm("NetWorks ID"), added: POLISH_MASCULINE_NEW },
      photos: { emoji: "📷", title: "Zdjęcia", noun: { one: "zdjęcie", few: "zdjęcia", many: "zdjęć" }, added: POLISH_NEUTER_NEW },
    },
  },
  en: {
    title: (month, year) => `📊 Database: ${month} ${year}`,
    period: (from, to) => `📅 Data from **${from}** to **${to}**`,
    monthOverMonth: "MoM",
    contributors: "👥 **Contributors**",
    submissions: "📨 **Submissions**",
    submitted: sameForm("submitted"),
    approved: sameForm("approved"),
    rejected: sameForm("rejected"),
    total: (value) => `${value} total`,
    byOperator: "**By operator**",
    byTechnology: "**By technology**",
    byBand: "**By band**",
    metrics: {
      stations: { emoji: "🏗️", title: "Stations", noun: englishForms("station", "stations"), added: sameForm("new") },
      cells: { emoji: "📶", title: "Cells", noun: englishForms("cell", "cells"), added: sameForm("new") },
      pcis: { emoji: "🔢", title: "PCI", noun: englishForms("PCI", "PCIs"), added: sameForm("new") },
      azimuths: { emoji: "🧭", title: "Azimuths", noun: englishForms("azimuth", "azimuths"), added: sameForm("new") },
      networks_ids: { emoji: "🆔", title: "NetWorks ID", noun: englishForms("NetWorks ID", "NetWorks IDs"), added: sameForm("new") },
      photos: { emoji: "📷", title: "Photos", noun: englishForms("photo", "photos"), added: sameForm("new") },
    },
  },
};

function technologyRank(technology: string): number {
  const index = TECHNOLOGY_ORDER.indexOf(technology);
  return index === -1 ? TECHNOLOGY_ORDER.length : index;
}

function compareTechnologies(a: string, b: string): number {
  return technologyRank(a) - technologyRank(b) || a.localeCompare(b);
}

function pluralForm(forms: Forms, category: Intl.LDMLPluralRule): string {
  if (category === "one") return forms.one;
  if (category === "few") return forms.few;
  return forms.many;
}

function metricTotals(stats: DatabaseMonthlyStats, metric: OperatorMetric): { total: number; added: number } {
  if (metric.key === "photos") return stats.photos;
  return {
    total: stats.operators.reduce((sum, row) => sum + row[metric.key], 0),
    added: stats.operators.reduce((sum, row) => sum + row[metric.added], 0),
  };
}

function formatTrend(current: number, previous: number, format: Formatters, suffix: string): string | null {
  if (current === 0 && previous === 0) return null;
  if (current === previous) return `➖ ${format.percent(0)} ${suffix}`;
  const arrow = current > previous ? "📈" : "📉";
  if (previous === 0) return `${arrow} ${format.number(previous)} → ${format.number(current)} ${suffix}`;
  const change = ((current - previous) / previous) * 100;
  return `${arrow} ${change > 0 ? "+" : "-"}${format.percent(Math.abs(change))} ${suffix}`;
}

function summarizeGroups<T extends GroupRow>(rows: readonly T[], nameOf: (row: T) => string): GroupSummary[] {
  const groups = new Map<string, GroupSummary>();
  for (const row of rows) {
    const name = nameOf(row);
    const group = groups.get(name) ?? { name, stationsAdded: 0, cellsAdded: 0, operators: [] };
    group.stationsAdded += row.stations_added;
    group.cellsAdded += row.cells_added;
    if (row.stations_added > 0) group.operators.push({ operator: row.operator, stationsAdded: row.stations_added });
    groups.set(name, group);
  }
  return [...groups.values()].filter((group) => group.stationsAdded > 0 || group.cellsAdded > 0);
}

export function buildDiscordMessage(stats: DatabaseMonthlyStats, previous: DatabaseMonthlyStats, month: string, language: Language): string {
  const labels = LABELS[language];
  const format = createFormatters(language);
  const pluralRules = new Intl.PluralRules(LOCALES[language]);
  const monthLabel = localizedMonth(month, language);
  const { submitted, approved, rejected } = stats.submissions;

  function counted(count: number, forms: Forms): string {
    return `${format.number(count)} ${pluralForm(forms, pluralRules.select(count))}`;
  }

  function joinWithTrend(parts: string[], current: number, previousValue: number): string {
    const trend = formatTrend(current, previousValue, format, labels.monthOverMonth);
    return (trend === null ? parts : [...parts, trend]).join(SEPARATOR);
  }

  function formatGroupLine(group: GroupSummary): string {
    const details: string[] = [];
    if (group.stationsAdded > 0) {
      const operators = [...group.operators]
        .sort((a, b) => b.stationsAdded - a.stationsAdded || compareOperators(a.operator, b.operator))
        .map((entry) => (group.operators.length === 1 ? entry.operator.name : `${entry.operator.name} +${format.number(entry.stationsAdded)}`));
      details.push(`+${counted(group.stationsAdded, labels.metrics.stations.noun)} (${operators.join(", ")})`);
    }
    if (group.cellsAdded > 0) details.push(`+${counted(group.cellsAdded, labels.metrics.cells.noun)}`);
    return `**${group.name}**: ${details.join(SEPARATOR)}`;
  }

  const lines = [
    `### ${labels.title(monthLabel.month, monthLabel.year)}`,
    labels.period(stats.from ?? "", stats.to ?? ""),
    joinWithTrend([`${labels.contributors}: ${format.number(stats.contributors)}`], stats.contributors, previous.contributors),
    labels.submissions,
    [counted(submitted, labels.submitted), counted(approved, labels.approved), counted(rejected, labels.rejected)].join(SEPARATOR),
  ];

  for (const metric of OPERATOR_METRICS) {
    const metricLabels = labels.metrics[metric.key];
    const totals = metricTotals(stats, metric);
    const details = [`+${counted(totals.added, metricLabels.added)}`, labels.total(format.number(totals.total))];
    if (totals.added > 0 && totals.total > 0) details.push(`+${format.percent((totals.added / totals.total) * 100)}`);
    lines.push(`${metricLabels.emoji} **${metricLabels.title}**`, joinWithTrend(details, totals.added, metricTotals(previous, metric).added));
  }

  const operatorLines = stats.operators
    .filter((row) => OPERATOR_METRICS.some((metric) => row[metric.added] > 0))
    .sort((a, b) => b.stations_added - a.stations_added || b.cells_added - a.cells_added || compareOperators(a.operator, b.operator))
    .map((row) => {
      const details = OPERATOR_METRICS.filter((metric) => row[metric.added] > 0).map(
        (metric) => `+${counted(row[metric.added], labels.metrics[metric.key].noun)}`,
      );
      return `**${row.operator.name}**: ${details.join(SEPARATOR)}`;
    });
  if (operatorLines.length > 0) lines.push(labels.byOperator, ...operatorLines);

  const technologyLines = summarizeGroups(stats.technologies, (row) => row.technology)
    .sort((a, b) => compareTechnologies(a.name, b.name))
    .map(formatGroupLine);
  if (technologyLines.length > 0) lines.push(labels.byTechnology, ...technologyLines);

  const bandLines = summarizeGroups(stats.bands, (row) => row.band.name)
    .sort((a, b) => b.stationsAdded - a.stationsAdded || b.cellsAdded - a.cellsAdded || compareBandNames(a.name, b.name))
    .map(formatGroupLine);
  if (bandLines.length > 0) lines.push(labels.byBand, ...bandLines);

  return lines.join("\n");
}
