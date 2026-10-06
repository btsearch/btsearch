import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { EditKind } from "../../model/types";

export type CellTexts = {
  language: string;
  band: string;
  unknownBand: string;
  selectBand: string;
  sector: string;
  newSector: string;
  omnidirectional: string;
  mode: string;
  cellType: string;
  confirmed: string;
  note: string;
  addNote: string;
  notePlaceholder: string;
  duplicate: string;
  remove: string;
  restore: string;
  standaloneOnly: string;
};

export function useCellTexts(editKind: EditKind): CellTexts {
  const { t, i18n } = useTranslation();
  const { language } = i18n;

  return useMemo(
    () => ({
      language,
      band: t("common:labels.band"),
      unknownBand: t("stations:cells.unknownBand"),
      selectBand: t("common:placeholder.selectBand"),
      sector: t("common:labels.azimuth"),
      newSector: t("stations:edit.cells.newSector"),
      omnidirectional: t("stationDetails:sectors.omnidirectional"),
      mode: t("stations:edit.cells.columns.mode"),
      cellType: t("common:labels.cellType"),
      confirmed: t("common:labels.confirmed"),
      note: t("stations:edit.cells.note"),
      addNote: t("stations:edit.cells.addNote"),
      notePlaceholder: t("stations:cells.notesPlaceholder"),
      duplicate: t("stations:edit.cells.duplicate"),
      remove: t("common:actions.delete"),
      restore: editKind === "review" ? t("stations:edit.cells.refuseDeletion") : t("common:actions.restore"),
      standaloneOnly: t("stations:edit.cells.hints.saOnly"),
    }),
    [t, language, editKind],
  );
}
