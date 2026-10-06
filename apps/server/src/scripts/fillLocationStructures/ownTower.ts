import type { NamedOwner, OperatorOwner } from "./address.js";

export type LocationOperator = { mnc: number | null; oldestStationAt: Date };

export const OPERATOR_MNCS: Record<OperatorOwner, number> = { plus: 26001, t_mobile: 26002, orange: 26003, play: 26006 };

export const OWN_TOWER_RULES = {
  play_under_a_year: "one operator, Play, its oldest station under a year old: Play",
  play_a_year_or_more: "one operator, Play, its oldest station a year old or more: On Tower Poland",
  plus: "one operator, Plus: Towerlink Poland",
  orange: "one operator, Orange: Orange",
  t_mobile: "one operator, T-Mobile: T-Mobile",
  other_operator: "one operator, none of the four: no owner",
  several_operators: "several operators: no owner",
  no_station: "no station: no owner",
};

export type OwnTowerRule = keyof typeof OWN_TOWER_RULES;
type OwnTower = { rule: OwnTowerRule; owner: NamedOwner | null };

export function resolveOwnTower(operators: readonly LocationOperator[], aYearAgo: Date): OwnTower {
  const [only, ...others] = operators;
  if (only === undefined) return { rule: "no_station", owner: null };
  if (others.length > 0) return { rule: "several_operators", owner: null };

  switch (only.mnc) {
    case OPERATOR_MNCS.play:
      return only.oldestStationAt > aYearAgo ? { rule: "play_under_a_year", owner: "play" } : { rule: "play_a_year_or_more", owner: "on_tower" };
    case OPERATOR_MNCS.plus:
      return { rule: "plus", owner: "towerlink" };
    case OPERATOR_MNCS.orange:
      return { rule: "orange", owner: "orange" };
    case OPERATOR_MNCS.t_mobile:
      return { rule: "t_mobile", owner: "t_mobile" };
    default:
      return { rule: "other_operator", owner: null };
  }
}
