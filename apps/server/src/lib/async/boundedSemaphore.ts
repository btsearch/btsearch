type SemaphoreWaiter = {
  resolve: () => void;
  reject: (reason: Error) => void;
  signal: AbortSignal | undefined;
  abort: (() => void) | undefined;
};

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new Error("Operation aborted");
}

export class BoundedSemaphore {
  private active = 0;
  private readonly waiters: SemaphoreWaiter[] = [];

  constructor(
    private readonly limit: number,
    private readonly maxWaiters: number,
  ) {}

  async run<Value>(task: () => Promise<Value>, signal?: AbortSignal): Promise<Value> {
    await this.acquire(signal);
    try {
      if (signal?.aborted) throw abortError(signal);
      const value = await task();
      if (signal?.aborted) throw abortError(signal);
      return value;
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.maxWaiters) return Promise.reject(new Error("Operation queue is full"));

    return new Promise<void>((resolve, reject) => {
      const waiter: SemaphoreWaiter = { resolve, reject, signal, abort: undefined };
      if (signal) {
        waiter.abort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index === -1) return;
          this.waiters.splice(index, 1);
          reject(abortError(signal));
        };
        signal.addEventListener("abort", waiter.abort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      if (next.signal && next.abort) next.signal.removeEventListener("abort", next.abort);
      next.resolve();
      return;
    }
    this.active -= 1;
  }
}
