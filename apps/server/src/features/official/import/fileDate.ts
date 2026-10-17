const PUBLISHED_ON = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fileDateOf(publishedOn: string | null, runStartedAt: Date): Date {
  if (publishedOn === null) return new Date(runStartedAt.getTime());

  const [, year, month, day] = publishedOn.match(PUBLISHED_ON) ?? [];
  if (year === undefined || month === undefined || day === undefined) throw new Error(`"${publishedOn}" is not a YYYY-MM-DD date`);

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      runStartedAt.getUTCHours(),
      runStartedAt.getUTCMinutes(),
      runStartedAt.getUTCSeconds(),
      runStartedAt.getUTCMilliseconds(),
    ),
  );
}
