import { useTranslation } from "react-i18next";

import { ANY_DIFFERENCE, type AnalyzerFilters, DIFFERENCE_FIELDS } from "../model/filterValues";
import type { DifferenceField, DifferenceFilter, DifferenceKind, RowStatus, TickBlock } from "../model/types";
import { CELL_NUMBER_LABELS } from "@/features/station-editing/model/ratFields";
import type { CellNumberField } from "@/features/station-editing/model/types";

type LabelledField = Extract<DifferenceField, CellNumberField>;
type MissingKind = `no-${LabelledField}`;
type AnalyzerSort = AnalyzerFilters["sort"];

type AnalyzerTexts = {
  getStatusLabel: (status: RowStatus) => string;
  getKindLabel: (kind: DifferenceFilter, plmn?: string) => string;
  getKindHint: (kind: DifferenceKind) => string | undefined;
  getBlockWord: (reason: TickBlock) => string | null;
  getBlockHint: (reason: TickBlock) => string;
  getSortLabel: (sort: AnalyzerSort) => string;
};

const LABELLED_FIELDS = DIFFERENCE_FIELDS.filter((field): field is LabelledField => field in CELL_NUMBER_LABELS);
const MISSING_KIND_FIELDS = Object.fromEntries(LABELLED_FIELDS.map((field) => [`no-${field}`, field])) as Record<MissingKind, LabelledField>;

function isMissingKind(kind: LabelledField | MissingKind): kind is MissingKind {
  return kind in MISSING_KIND_FIELDS;
}

export function useAnalyzerTexts(): AnalyzerTexts {
  const { t } = useTranslation("cellAnalyzer");

  function getStatusLabel(status: RowStatus): string {
    if (status === "found") return t("status.found");
    if (status === "probable") return t("status.probable");
    return status === "notFound" ? t("status.notFound") : t("status.notAnalyzed");
  }

  function getKindLabel(kind: DifferenceFilter, plmn?: string): string {
    if (kind === ANY_DIFFERENCE) return t("diff.any");
    if (kind === "new") return t("diff.new");
    if (kind === "network") return plmn === undefined ? t("diff.missingNetwork") : t("diff.network", { plmn });
    if (kind === "by-lac") return t("diff.byLac");
    if (kind === "shared") return t("diff.shared");
    if (kind === "unknown-cell") return t("diff.unknownCell");
    if (kind === "unknown-operator") return t("main:unknownOperator");
    if (kind === "no-identifiers") return t("diff.noIdentifiers");
    if (kind === "gnbidLength") return t("diff.gnbidLength");
    if (kind === "no-gnbidLength") return t("diff.missingGnbidLength");
    if (kind === "analyzer-disabled") return t("diff.analyzerDisabled");
    if (isMissingKind(kind)) return t("diff.missing", { field: CELL_NUMBER_LABELS[MISSING_KIND_FIELDS[kind]] });
    return t("diff.other", { field: CELL_NUMBER_LABELS[kind] });
  }

  function getKindHint(kind: DifferenceKind): string | undefined {
    return kind === "new" ? t("diff.newHint") : undefined;
  }

  function getBlockWord(reason: TickBlock): string | null {
    if (reason === "pending") return null;
    if (reason === "noDifferences") return t("diff.none");
    if (reason === "shared") return t("diff.shared");
    if (reason === "cellUnknown") return t("diff.unknownCell");
    if (reason === "analyzerDisabled") return t("diff.analyzerDisabled");
    return reason === "operatorUnknown" ? t("main:unknownOperator") : t("diff.noIdentifiers");
  }

  function getBlockHint(reason: TickBlock): string {
    if (reason === "pending") return t("reason.pending");
    if (reason === "noDifferences") return t("reason.noDifferences");
    if (reason === "shared") return t("reason.shared");
    if (reason === "cellUnknown") return t("reason.cellUnknown");
    if (reason === "analyzerDisabled") return t("reason.analyzerDisabled");
    return reason === "operatorUnknown" ? t("reason.operatorUnknown") : t("reason.noIdentifiers");
  }

  function getSortLabel(sort: AnalyzerSort): string {
    if (sort === "station") return t("common:labels.station");
    return sort === "result" ? t("panel.result") : t("toolbar.sortFile");
  }

  return { getStatusLabel, getKindLabel, getKindHint, getBlockWord, getBlockHint, getSortLabel };
}
