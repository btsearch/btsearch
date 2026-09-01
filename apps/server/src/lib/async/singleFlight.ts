export class SingleFlight<Key, Value> {
  private readonly requests = new Map<Key, Promise<Value>>();

  async run(key: Key, task: () => Promise<Value>): Promise<Value> {
    const inFlight = this.requests.get(key);
    if (inFlight) return inFlight;

    const pending = task();
    this.requests.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.requests.get(key) === pending) this.requests.delete(key);
    }
  }
}
