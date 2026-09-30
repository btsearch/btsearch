import { operators, proposedStations, stations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";

export type StationLabel = { stationId: string | null; operatorName: string | null; operatorMnc: number | null };

export async function getSubmissionStationLabels(rows: { id: string; station_id: number | null }[]): Promise<Map<string, StationLabel>> {
  const submissionIds = rows.map((row) => row.id);
  const stationIds = [...new Set(rows.flatMap((row) => (row.station_id === null ? [] : [row.station_id])))];

  const [proposed, existing] = await Promise.all([
    submissionIds.length > 0
      ? db
          .select({
            submissionId: proposedStations.submission_id,
            stationId: proposedStations.station_id,
            operatorName: operators.name,
            operatorMnc: operators.mnc,
          })
          .from(proposedStations)
          .leftJoin(operators, eq(operators.id, proposedStations.operator_id))
          .where(inArray(proposedStations.submission_id, submissionIds))
      : [],
    stationIds.length > 0
      ? db
          .select({ id: stations.id, stationId: stations.station_id, operatorName: operators.name, operatorMnc: operators.mnc })
          .from(stations)
          .leftJoin(operators, eq(operators.id, stations.operator_id))
          .where(inArray(stations.id, stationIds))
      : [],
  ]);

  const proposedBySubmission = new Map(proposed.map((row) => [row.submissionId, row]));
  const existingById = new Map(existing.map((row) => [row.id, row]));

  return new Map(
    rows.map((row) => {
      const proposedStation = proposedBySubmission.get(row.id);
      const existingStation = row.station_id === null ? undefined : existingById.get(row.station_id);
      return [
        row.id,
        {
          stationId: proposedStation?.stationId ?? existingStation?.stationId ?? null,
          operatorName: proposedStation?.operatorName ?? existingStation?.operatorName ?? null,
          operatorMnc: proposedStation?.operatorMnc ?? existingStation?.operatorMnc ?? null,
        },
      ];
    }),
  );
}

export function stationLabelMetadata(label: Partial<StationLabel> | undefined): Record<string, string | number> {
  return {
    ...(label?.stationId ? { station_id: label.stationId } : {}),
    ...(label?.operatorName ? { station_operator_name: label.operatorName } : {}),
    ...(typeof label?.operatorMnc === "number" ? { station_operator_mnc: label.operatorMnc } : {}),
  };
}
