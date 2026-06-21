/** YYYY-MM-DD for "today" in the given timezone offset (defaults to server local). */
export function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgoISO(n: number, d = new Date()): string {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
}

export function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
