import { useEffect, useState } from "react";

import { type TimedStep, formatImportStepDuration } from "./format";

export function StepDuration({ step, className }: { step: TimedStep; className: string }) {
  const [now, setNow] = useState(Date.now);
  const duration = formatImportStepDuration(step, now);
  const isTicking = duration !== null && step.finishedAt === null;

  useEffect(() => {
    if (!isTicking) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isTicking]);

  if (duration === null) return null;

  return <span className={className}>{duration}</span>;
}
