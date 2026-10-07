import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { emfReportsQueryOptions } from "../api";
import { listAntennaTableReports } from "../reports";
import type { EmfReport, EmfSite } from "../types";

const NOT_LISTED = -1;

export type AntennaReportChoice = {
  shownReport: EmfReport;
  listedReports: EmfReport[];
  shownIndex: number | null;
  olderReport: EmfReport | null;
  alternativeReport: EmfReport | null;
  showReport: (reportUrl: string) => void;
};

export function useAntennaReportChoice(site: EmfSite, openedReport: EmfReport): AntennaReportChoice {
  const [chosenReportUrl, setChosenReportUrl] = useState<string | null>(null);
  const { data: reports } = useQuery(emfReportsQueryOptions(site));

  const listedReports = reports === undefined ? [] : listAntennaTableReports(reports);
  const shownReportUrl = chosenReportUrl ?? openedReport.url;
  const listedIndex = listedReports.findIndex((listed) => listed.url === shownReportUrl);

  if (listedIndex === NOT_LISTED) {
    return {
      shownReport: openedReport,
      listedReports,
      shownIndex: null,
      olderReport: null,
      alternativeReport: null,
      showReport: setChosenReportUrl,
    };
  }

  const olderReport = listedReports.at(listedIndex + 1) ?? null;
  const newerReport = listedIndex === 0 ? null : listedReports[listedIndex - 1];

  return {
    shownReport: listedReports[listedIndex],
    listedReports,
    shownIndex: listedIndex,
    olderReport,
    alternativeReport: olderReport ?? newerReport,
    showReport: setChosenReportUrl,
  };
}
