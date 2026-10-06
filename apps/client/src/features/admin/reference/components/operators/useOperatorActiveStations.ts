import { useQuery } from "@tanstack/react-query";

import { stationBreakdownQueryOptions } from "../../api/statistics";
import { indexBreakdown } from "../../utils/bands";
import { type Loadable, toLoadable } from "../shared/loadable";

export function useOperatorActiveStations(operatorId: number): Loadable<number> {
  const { data: breakdown, isError } = useQuery(stationBreakdownQueryOptions("operator"));
  const stations = breakdown === undefined ? undefined : (indexBreakdown(breakdown, "operatorId").get(operatorId)?.stations ?? 0);

  return toLoadable(stations, isError);
}
