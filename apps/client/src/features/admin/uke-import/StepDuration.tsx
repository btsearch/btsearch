import { useEffect, useState } from "react";

import type { ImportStep } from "./api";
import { formatImportStepDuration } from "./format";

export function StepDuration({ step, className }: { step: ImportStep; className: string }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (step.status !== "running" || !step.startedAt || step.finishedAt || !Number.isFinite(Date.parse(step.startedAt))) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [step.status, step.startedAt, step.finishedAt]);

  const duration = formatImportStepDuration(step, now);
  if (duration === null) return null;

  return <span className={className}>{duration}</span>;
}
