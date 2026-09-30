export function isFirstPartyOrigin(origin: string | undefined): boolean {
  if (origin === undefined || !URL.canParse(origin)) return false;
  const { hostname } = new URL(origin);
  return hostname === "btsearch.pl" || (process.env.NODE_ENV !== "production" && hostname === "localhost");
}
