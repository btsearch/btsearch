type PhotoUploadBatchProgress = Readonly<{ sent: number; total: number }> | null;

export type PhotoUploadProgressSnapshot = Readonly<{
  sent: number;
  total: number;
  hasUnknownTotal: boolean;
}> | null;

const batches = new Map<string, PhotoUploadBatchProgress>();
const listeners = new Set<() => void>();
let snapshot: PhotoUploadProgressSnapshot = null;

function publish(): void {
  let next: PhotoUploadProgressSnapshot = null;
  if (batches.size > 0) {
    let sent = 0;
    let total = 0;
    let hasUnknownTotal = false;
    for (const progress of batches.values()) {
      if (progress === null || progress.total <= 0) {
        hasUnknownTotal = true;
        continue;
      }
      sent += progress.sent;
      total += progress.total;
    }
    next = { sent, total, hasUnknownTotal };
  }

  if (next === snapshot) return;
  if (
    next !== null &&
    snapshot !== null &&
    next.sent === snapshot.sent &&
    next.total === snapshot.total &&
    next.hasUnknownTotal === snapshot.hasUnknownTotal
  )
    return;

  snapshot = next;
  for (const listener of listeners) listener();
}

function start(id: string): void {
  if (batches.has(id)) return;
  batches.set(id, null);
  publish();
}

function update(id: string, sent: number, total: number): void {
  if (!batches.has(id)) return;
  const previous = batches.get(id);
  if (previous !== null && previous !== undefined && previous.sent === sent && previous.total === total) return;
  batches.set(id, { sent, total });
  publish();
}

function finish(id: string): void {
  if (!batches.delete(id)) return;
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PhotoUploadProgressSnapshot {
  return snapshot;
}

function getServerSnapshot(): PhotoUploadProgressSnapshot {
  return null;
}

export const photoUploadProgressStore = { start, update, finish, subscribe, getSnapshot, getServerSnapshot };
