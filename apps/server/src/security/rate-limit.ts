import type { FastifyRequest, preHandlerHookHandler } from "fastify";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function sensitiveRateLimit(
  name: string,
  maxAttempts: number,
  windowMs: number
): preHandlerHookHandler {
  return async (request, reply) => {
    const now = Date.now();
    if (buckets.size > 1000) cleanup(now);

    const key = `${name}:${request.ip}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    current.count += 1;
    if (current.count > maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      reply.header("Retry-After", retryAfter);
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts. Please try again later."
        }
      });
    }
  };
}

export function clearRateLimitStateForTests() {
  buckets.clear();
}
