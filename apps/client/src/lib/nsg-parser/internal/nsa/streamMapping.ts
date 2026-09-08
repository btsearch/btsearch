import type { DefaultDataSubscriptionChange, LteAnchor, TimedLteServingCellInfo } from "./model";

const STREAM_VOTE_WINDOW_US = 15_000_000;

type SubscriptionGroup = Readonly<{
  subId: number | null;
  anchors: readonly LteAnchor[];
  anchorsByIdentity: ReadonlyMap<number, readonly LteAnchor[]>;
}>;

type StreamVote = Readonly<{
  elapsedUs: number;
  group: SubscriptionGroup;
}>;

function subscriptionKey(anchor: LteAnchor): string | null {
  const { slotId, subId } = anchor.cell;
  if (slotId === null && subId === null) return null;
  return `${slotId ?? "?"}:${subId ?? "?"}`;
}

function lowerBound<T>(items: readonly T[], elapsedUs: number, getElapsedUs: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getElapsedUs(items[middle]) < elapsedUs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound<T>(items: readonly T[], elapsedUs: number, getElapsedUs: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getElapsedUs(items[middle]) <= elapsedUs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nearestVote(votes: readonly StreamVote[], elapsedUs: number): StreamVote | null {
  const index = lowerBound(votes, elapsedUs, (vote) => vote.elapsedUs);
  if (index === 0) return votes[0] ?? null;
  if (index === votes.length) return votes.at(-1) ?? null;
  return elapsedUs - votes[index - 1].elapsedUs <= votes[index].elapsedUs - elapsedUs ? votes[index - 1] : votes[index];
}

function createSubscriptionGroups(anchors: readonly LteAnchor[]): SubscriptionGroup[] {
  const grouped = new Map<string, LteAnchor[]>();
  for (const anchor of anchors) {
    const key = subscriptionKey(anchor);
    if (key === null) continue;
    const group = grouped.get(key);
    if (group) group.push(anchor);
    else grouped.set(key, [anchor]);
  }

  const groups: SubscriptionGroup[] = [];
  for (const anchorsForSubscription of grouped.values()) {
    anchorsForSubscription.sort((left, right) => left.cell.elapsedUs - right.cell.elapsedUs || left.cell.eventIndex - right.cell.eventIndex);
    const anchorsByIdentity = new Map<number, LteAnchor[]>();
    for (const anchor of anchorsForSubscription) {
      if (anchor.cell.eci === null) continue;
      const matches = anchorsByIdentity.get(anchor.cell.eci);
      if (matches) matches.push(anchor);
      else anchorsByIdentity.set(anchor.cell.eci, [anchor]);
    }
    groups.push({ subId: anchorsForSubscription[0].cell.subId, anchors: anchorsForSubscription, anchorsByIdentity });
  }
  return groups;
}

function hasMatchingAnchor(group: SubscriptionGroup, info: TimedLteServingCellInfo): boolean {
  const anchors = group.anchorsByIdentity.get(info.cellIdentity);
  if (!anchors) return false;
  const minimumElapsedUs = info.elapsedUs - STREAM_VOTE_WINDOW_US;
  const maximumElapsedUs = info.elapsedUs + STREAM_VOTE_WINDOW_US;
  const start = lowerBound(anchors, minimumElapsedUs, (anchor) => anchor.cell.elapsedUs);
  for (let index = start; index < anchors.length; index++) {
    const anchor = anchors[index];
    if (anchor.cell.elapsedUs > maximumElapsedUs) break;
    if (anchor.cell.earfcn === null || anchor.cell.earfcn === info.earfcn) return true;
  }
  return false;
}

function collectStreamVotes(groups: readonly SubscriptionGroup[], infos: readonly TimedLteServingCellInfo[]): Map<number, StreamVote[]> {
  const votesByStream = new Map<number, StreamVote[]>();
  for (const info of infos) {
    let matchedGroup: SubscriptionGroup | null = null;
    let ambiguous = false;
    for (const group of groups) {
      if (!hasMatchingAnchor(group, info)) continue;
      if (matchedGroup !== null) {
        ambiguous = true;
        break;
      }
      matchedGroup = group;
    }
    if (matchedGroup === null || ambiguous) continue;
    const votes = votesByStream.get(info.streamIndex);
    const vote = { elapsedUs: info.elapsedUs, group: matchedGroup };
    if (votes) votes.push(vote);
    else votesByStream.set(info.streamIndex, [vote]);
  }
  for (const votes of votesByStream.values()) votes.sort((left, right) => left.elapsedUs - right.elapsedUs);
  return votesByStream;
}

function defaultDataSubscriptionAt(changes: readonly DefaultDataSubscriptionChange[], elapsedUs: number): number | null {
  const index = upperBound(changes, elapsedUs, (change) => change.elapsedUs);
  return index === 0 ? null : changes[index - 1].subId;
}

export function createNsaAnchorResolver(
  anchors: readonly LteAnchor[],
  infos: readonly TimedLteServingCellInfo[],
  defaultDataSubscriptions: readonly DefaultDataSubscriptionChange[],
): (streamIndex: number, elapsedUs: number) => readonly LteAnchor[] | null {
  const groups = createSubscriptionGroups(anchors);
  const votesByStream = collectStreamVotes(groups, infos);
  const orderedDefaultDataSubscriptions = [...defaultDataSubscriptions].sort((left, right) => left.elapsedUs - right.elapsedUs);

  return (streamIndex, elapsedUs) => {
    const votes = votesByStream.get(streamIndex);
    if (votes && votes.length > 0) return nearestVote(votes, elapsedUs)?.group.anchors ?? null;

    const defaultDataSubId = defaultDataSubscriptionAt(orderedDefaultDataSubscriptions, elapsedUs);
    if (defaultDataSubId !== null) {
      const matchingGroups = groups.filter((group) => group.subId === defaultDataSubId);
      if (matchingGroups.length === 1) return matchingGroups[0].anchors;
    }
    return groups.length === 1 ? groups[0].anchors : null;
  };
}
