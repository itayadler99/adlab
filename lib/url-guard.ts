// SSRF guard. Blocks http://, internal hosts, loopback, link-local, RFC1918.
// Use on every server-side fetch where the URL came from a request body.

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

export function isPublicHttpsUrl(u: string): boolean {
  let parsed: URL;
  try { parsed = new URL(u); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith(".internal")) return false;
  if (host.endsWith(".local")) return false;
  // IPv4 literal check
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    for (const re of PRIVATE_V4) if (re.test(host)) return false;
  }
  // IPv6 loopback / link-local
  if (host === "::1" || host.startsWith("[fe80") || host.startsWith("[fc") || host.startsWith("[fd")) return false;
  return true;
}

export function assertPublicHttpsUrl(u: string, label = "url"): void {
  if (!isPublicHttpsUrl(u)) {
    throw new Error(`${label}: https public host required`);
  }
}
