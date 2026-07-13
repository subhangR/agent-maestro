// Query-string helper. Skips undefined/null, encodeURIComponent's values,
// returns '' for an empty set (so callers can append unconditionally) or a
// leading-'?' string otherwise.
//
// The future `?token=` seam (see api-services plan §3) is appended LAST by the
// client's withToken(), so it composes after any query built here.
export function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
