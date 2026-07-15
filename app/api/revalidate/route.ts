import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// On-demand cache invalidation, called by the data manager after a successful
// `dm publish`. Pages carry `revalidate = 86400` as a self-heal safety net, so
// without this a Firestore publish would take up to a day to appear; with it,
// every page regenerates on its next visit. The whole layout is swept because
// published collections (politicians, central/state government, office seats)
// feed nearly every route, and a sweep only marks entries stale - Vercel bills
// an ISR write per page actually visited afterwards, not per page invalidated.
//
// Note: a page that regenerates within ~30 min of a publish can still bake the
// previous in-process TTL snapshot (lib/data.ts memos); the daily revalidate
// self-heals those. That trade is deliberate - see README "How data flows".

/** Constant-time comparison so the secret cannot be guessed byte-by-byte from
 *  response timing. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  // Fail closed: with no secret configured the endpoint is disabled, never open.
  if (!expected) return NextResponse.json({ error: 'not-configured' }, { status: 503 });

  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secretMatches(given, expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true });
}
