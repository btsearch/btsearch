type GuardedSlice = { stagedCount: number; liveCount: number; holdShrinkPercent: number; isApproved: boolean };

export function decideSlice({ stagedCount, liveCount, holdShrinkPercent, isApproved }: GuardedSlice): "applied" | "held" {
  if (isApproved) return "applied";
  if (stagedCount === 0) return liveCount === 0 ? "applied" : "held";

  return stagedCount * 100 < liveCount * (100 - holdShrinkPercent) ? "held" : "applied";
}
