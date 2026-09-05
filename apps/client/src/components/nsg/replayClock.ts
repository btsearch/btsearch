export function createReplayClock() {
  let playheadMs: number | null = null;
  const listeners = new Set<(value: number | null) => void>();

  return {
    get: () => playheadMs,
    set(value: number | null) {
      playheadMs = value;
      for (const listener of listeners) listener(value);
    },
    subscribe(listener: (value: number | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ReplayClock = ReturnType<typeof createReplayClock>;
