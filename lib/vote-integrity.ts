// Server-side vote integrity. Layered, and honest about limits: no login-less
// system is sybil-proof. We (1) verify a Cloudflare Turnstile token, (2) rate-
// limit on a hashed, coarsened IP, and (3) dedupe on a salted hash of
// (coarse IP + device fingerprint). We NEVER store raw IPs or fingerprints.
import { createHash } from 'node:crypto';

const SALT = process.env.VOTE_HASH_SALT || 'dev-only-change-me';

// If a production deploy is still using the built-in dev salt, our
// coarse-IP/fingerprint hashes are effectively unsalted, weakening vote
// dedupe. The remedy is an ops step: set a strong random VOTE_HASH_SALT in the
// environment. We WARN loudly rather than throw so an unset env var cannot take
// the entire vote path down (sha() is on the hot path of every POST /api/vote).
// Add hard enforcement only once the secret is confirmed set in production.
if (process.env.NODE_ENV === 'production' && SALT === 'dev-only-change-me') {
  console.error(
    '[vote-integrity] CRITICAL: VOTE_HASH_SALT is unset or set to the default ' +
      'dev value in production. Set a strong random VOTE_HASH_SALT to protect ' +
      'vote-integrity hashes.',
  );
}

export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') || '0.0.0.0';
}

/** Coarsen to a /24 (IPv4) or /48 (IPv6) so shared NAT doesn't over-collapse. */
export function coarsenIp(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48';
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}

export function sha(input: string): string {
  return createHash('sha256').update(`${SALT}:${input}`).digest('hex').slice(0, 32);
}

/** Deterministic per-voter key: both the coarse IP AND the fingerprint must
 *  match to count as the same voter (avoids collapsing a whole office/campus). */
export function voterKey(ip: string, fingerprint: string): string {
  return sha(`${coarsenIp(ip)}|${fingerprint || 'none'}`);
}

export function ipRateKey(ip: string, politicianId: string): string {
  return sha(`${coarsenIp(ip)}|${politicianId}`);
}

export interface TurnstileResult {
  ok: boolean;
  dev?: boolean;
  reason?: string;
}

export async function verifyTurnstile(token: string, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Not configured → development mode: allow, but flag it.
  if (!secret) return { ok: true, dev: true };
  if (!token) return { ok: false, reason: 'missing-token' };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    return { ok: data.success, reason: data['error-codes']?.join(',') };
  } catch (e) {
    return { ok: false, reason: 'verify-failed' };
  }
}

// Rate limiting: Upstash sliding window if configured, else an in-process
// fallback so local dev still enforces something.
type Limiter = (key: string) => Promise<{ success: boolean }>;

let limiter: Limiter | null = null;
const memHits = new Map<string, number[]>();

function memLimiter(limit: number, windowMs: number): Limiter {
  return async (key: string) => {
    const now = Date.now();
    const arr = (memHits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    memHits.set(key, arr);
    return { success: arr.length <= limit };
  };
}

async function getLimiter(): Promise<Limiter> {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const { Ratelimit } = await import('@upstash/ratelimit');
      const { Redis } = await import('@upstash/redis');
      const rl = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(10, '1 h'),
        prefix: 'ryp:vote',
      });
      limiter = async (key: string) => {
        const { success } = await rl.limit(key);
        return { success };
      };
      return limiter;
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[vote-integrity] Failed to initialize Upstash Redis rate limiter, falling back to in-memory:', err);
      }
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[vote-integrity] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not configured. Rate limiting is falling back to in-memory, which does not persist across serverless instances.');
    }
  }
  limiter = memLimiter(10, 60 * 60 * 1000);
  return limiter;
}

export async function checkRateLimit(ip: string, politicianId: string): Promise<boolean> {
  const rl = await getLimiter();
  const { success } = await rl(ipRateKey(ip, politicianId));
  return success;
}
