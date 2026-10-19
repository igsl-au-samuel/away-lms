/**
 * Loose flood protection for /mcp (spec threat model, "Flooding or cost"; issue #243).
 *
 * `limiter(binding)` returns `check(key)`, true when the call may go ahead. With the Workers
 * rate-limiting binding it asks the binding; without one (local dev, tests, a plan that refuses
 * the binding) it keeps a fixed window per key in this isolate's memory.
 *
 * This is a loose filter, not a guarantee. The binding's counts are per Cloudflare location and
 * eventually consistent, and the in-memory window is per isolate and lost on a restart. The real
 * ceiling is Supabase's own auth limits and the free-tier quotas, which stop the service instead
 * of costing money.
 */

/** Calls allowed per key per period. Keep in step with `ratelimits` in wrangler.jsonc. */
export const LIMIT = 60;
export const PERIOD_SECONDS = 60;

/** The part of the Workers rate-limiting binding we use. */
export type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type RateCheck = (key: string) => Promise<boolean>;

/** Stops one isolate's map growing without bound if keys keep changing. */
const MAX_KEYS = 10_000;

export function limiter(binding: RateLimitBinding | undefined, options: { now?: () => number } = {}): RateCheck {
  if (binding) {
    return async (key) => {
      try {
        return (await binding.limit({ key })).success;
      } catch {
        // A broken limiter must not take the endpoint down; auth still applies.
        return true;
      }
    };
  }

  const now = options.now ?? Date.now;
  const windowMs = PERIOD_SECONDS * 1000;
  const windows = new Map<string, { start: number; count: number }>();
  return async (key) => {
    const t = now();
    const current = windows.get(key);
    if (!current || t - current.start >= windowMs) {
      if (windows.size >= MAX_KEYS) {
        for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
        if (windows.size >= MAX_KEYS) windows.clear();
      }
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= LIMIT;
  };
}

/** The one 429 for both checks. No detail about which key tripped. */
export function rateLimited(): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", error_description: "Too many requests. Try again shortly." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(PERIOD_SECONDS) },
    },
  );
}
