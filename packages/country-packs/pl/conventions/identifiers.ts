import type { StationIdentifierKind } from "@openbts/shared/contract";

import type { CountryConventions, OperatorRef } from "../../core/conventions.ts";
import { PLAY_PLMN, PLUS_PLMN, isNetworksMember } from "../operators.ts";

const NETWORKS_MEMBER_KINDS: readonly StationIdentifierKind[] = ["networksId", "networksName", "operatorName"];
const OWN_NAME_KINDS: readonly StationIdentifierKind[] = ["operatorName"];

export function identifierKinds(operator: OperatorRef): readonly StationIdentifierKind[] {
  if (isNetworksMember(operator)) return NETWORKS_MEMBER_KINDS;
  return operator.primaryPlmn === PLUS_PLMN || operator.primaryPlmn === PLAY_PLMN ? OWN_NAME_KINDS : [];
}

export const identifierPrefixes: CountryConventions["identifierPrefixes"] = { networksId: "N!" };
