export function endOfToday(): Date {
  const day = new Date();
  day.setUTCHours(23, 59, 59, 999);
  return day;
}
