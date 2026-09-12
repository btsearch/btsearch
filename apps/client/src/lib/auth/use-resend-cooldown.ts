"use client";

import { useCallback, useEffect, useState } from "react";

export const RESEND_COOLDOWN_SECONDS = 60;

export function useResendCooldown(initialSeconds = 0) {
  const [cooldown, setCooldown] = useState(initialSeconds);

  useEffect(() => {
    if (cooldown <= 0) return;

    const interval = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown]);

  const startCooldown = useCallback((seconds = RESEND_COOLDOWN_SECONDS) => setCooldown(seconds), []);

  return {
    cooldown,
    isCoolingDown: cooldown > 0,
    startCooldown,
  };
}
