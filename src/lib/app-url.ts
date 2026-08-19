/**
 * Absolute URL for `path` on this deployment.
 *
 * Prefers `NEXT_PUBLIC_APP_URL` over `request.url`: the latter is derived from the Host
 * header, so an attacker-controlled Host would let an OAuth callback redirect off-site.
 * Falls back to the request origin for local dev, where the env var is often unset.
 */
export function appUrl(path: string, request: { url: string }): URL {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) {
    try {
      return new URL(path, base);
    } catch {
      // malformed env var — fall through to the request origin
    }
  }
  return new URL(path, request.url);
}
