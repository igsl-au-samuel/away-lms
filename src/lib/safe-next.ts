const ORIGIN = "http://safe-next.invalid";

/** Same-origin absolute paths only; anything else falls back to `/`. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  // Browsers strip tabs and newlines inside a URL, so `/\t/evil.com` becomes `//evil.com`.
  // Resolve it the way a browser would and require that it stays on our origin.
  let url: URL;
  try {
    url = new URL(next, ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== ORIGIN) return "/";
  return url.pathname + url.search + url.hash;
}
