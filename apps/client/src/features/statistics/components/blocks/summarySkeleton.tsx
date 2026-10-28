import { CardBlock } from "../card/statisticsCard";
import { NumberStripSkeleton } from "./numberStrip";
import { OperatorSharesSkeleton } from "./operatorShares";

export function SummarySkeleton() {
  return (
    <>
      <CardBlock>
        <NumberStripSkeleton />
      </CardBlock>
      <CardBlock>
        <OperatorSharesSkeleton />
      </CardBlock>
    </>
  );
}
