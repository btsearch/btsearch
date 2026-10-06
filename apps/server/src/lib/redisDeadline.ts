const ANSWER_DEADLINE_MS = 2_000;

export async function withRedisDeadline<T>(pending: Promise<T>): Promise<T> {
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new Error("Redis did not answer in time")), ANSWER_DEADLINE_MS);
  return Promise.race([pending, deadline.promise]).finally(() => clearTimeout(timer));
}
