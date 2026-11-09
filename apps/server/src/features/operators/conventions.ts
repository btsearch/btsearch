import { conventionsFor, defaultLteEarfcns } from "@openbts/country-packs";
import { bandsForChannel } from "@openbts/shared/bandCatalog";
import type { Operator, OperatorConventions, OperatorWithConventions } from "@openbts/shared/contract";

import { type LocatedOperatorRef, loadOperatorRefs } from "./ref.js";

export function toOperatorConventions(operator: LocatedOperatorRef): OperatorConventions {
  const conventions = conventionsFor(operator.countryCode);
  const earfcns = operator.primaryPlmn === null ? [] : defaultLteEarfcns(operator.primaryPlmn);

  return {
    gnbidLength: conventions.gnbidLength(operator),
    identifierKinds: [...conventions.identifierKinds(operator)],
    lteSectorRule: conventions.lteSectorRule(operator),
    defaultEarfcns: earfcns.flatMap((earfcn) => bandsForChannel("LTE", earfcn).map((band) => ({ bandCode: band.code, earfcn }))),
  };
}

export async function loadOperatorConventions(operatorIds: readonly number[]): Promise<Map<number, OperatorConventions>> {
  const operators = await loadOperatorRefs(operatorIds);
  return new Map([...operators].map(([id, operator]) => [id, toOperatorConventions(operator)]));
}

export function withConventions(operator: Operator, conventionsById: ReadonlyMap<number, OperatorConventions>): OperatorWithConventions {
  const conventions = conventionsById.get(operator.id);
  return conventions === undefined ? operator : { ...operator, conventions };
}
