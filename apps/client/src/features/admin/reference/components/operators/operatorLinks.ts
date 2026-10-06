import { fetchOperator, updateOperator } from "../../api/operators";
import type { Operator, OperatorLinkInput } from "../../types";

export function listSharedNetworks(operator: Operator, operators: readonly Operator[] = []): Operator[] {
  const networkIds = new Set(operator.links.map((link) => link.operatorId));
  return operators.filter((candidate) => networkIds.has(candidate.id));
}

export function listNetworkMembers(networkId: number, operators: readonly Operator[] = []): Operator[] {
  return operators.filter((candidate) => candidate.links.some((link) => link.operatorId === networkId));
}

export function listLinkCandidates(operator: Operator, operators: readonly Operator[] = []): Operator[] {
  const networkIds = new Set(operator.links.map((link) => link.operatorId));
  return operators.filter(
    (candidate) =>
      candidate.countryCode === operator.countryCode &&
      candidate.id !== operator.id &&
      !networkIds.has(candidate.id) &&
      !candidate.links.some((link) => link.operatorId === operator.id),
  );
}

async function fetchLinksOutsideNetwork(member: Operator, networkId: number): Promise<OperatorLinkInput[]> {
  const currentMember = (await fetchOperator(member.id)) ?? member;
  return currentMember.links
    .filter((link) => link.operatorId !== networkId)
    .map((link): OperatorLinkInput => ({ kind: link.kind, operatorId: link.operatorId }));
}

export async function joinSharedNetwork(member: Operator, networkId: number): Promise<Operator> {
  const otherLinks = await fetchLinksOutsideNetwork(member, networkId);
  const links: OperatorLinkInput[] = [...otherLinks, { kind: "jvMember", operatorId: networkId }];
  return updateOperator(member.id, { links });
}

export async function leaveSharedNetwork(member: Operator, networkId: number): Promise<Operator> {
  const links = await fetchLinksOutsideNetwork(member, networkId);
  return updateOperator(member.id, { links });
}
