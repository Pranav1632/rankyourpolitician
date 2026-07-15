import { NextRequest, NextResponse } from 'next/server';
import { getPerson, getPersonSentiment } from '@/lib/data';
import { recordVote } from '@/lib/votes';
import { getClientIp, verifyTurnstile, checkRateLimit, voterKey } from '@/lib/vote-integrity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live sentiment for one person. VoteWidget fetches this on mount because
 *  profile HTML is ISR-cached for up to a day - the page stays a cheap static
 *  serve while the numbers stay fresh. Reads the in-process TTL-cached
 *  aggregates (zero extra Firestore reads) and is CDN-cached for 5 minutes,
 *  so most page views never even invoke the function. */
export async function GET(req: NextRequest) {
  const politicianId = req.nextUrl.searchParams.get('politicianId');
  if (!politicianId) return NextResponse.json({ error: 'bad-request' }, { status: 400 });

  const res = await getPerson(politicianId);
  if (!res || (!res.person && !res.redirectTo)) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  // Appointed officials are information-only and carry no ratings.
  if (res.person && res.person.kind === 'official') return NextResponse.json({ error: 'not-ratable' }, { status: 403 });

  const s = await getPersonSentiment(res.redirectTo ?? politicianId);
  return NextResponse.json(
    {
      ok: true,
      sentiment: { mean: s.raw_mean, votes: s.n_votes, distribution: s.distribution, confidence: s.confidence },
    },
    { headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } },
  );
}

export async function POST(req: NextRequest) {
  let body: { politicianId?: string; rating?: number; fingerprint?: string; turnstileToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const { politicianId, rating, fingerprint = '', turnstileToken = '' } = body;
  if (!politicianId || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const res = await getPerson(politicianId);
  if (!res || (!res.person && !res.redirectTo)) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  // Appointed officials are information-only and must never be rated.
  if (res.person && res.person.kind === 'official') {
    return NextResponse.json({ error: 'not-ratable' }, { status: 403 });
  }

  const ip = getClientIp(req.headers);

  const bot = await verifyTurnstile(turnstileToken, ip);
  if (!bot.ok) return NextResponse.json({ error: 'captcha', reason: bot.reason }, { status: 403 });

  const allowed = await checkRateLimit(ip);
  if (!allowed) return NextResponse.json({ error: 'rate-limited' }, { status: 429 });

  const key = voterKey(ip, fingerprint);
  const { sentiment, updated } = await recordVote(politicianId, key, rating);

  return NextResponse.json({
    ok: true,
    updated,
    dev: bot.dev ?? false,
    sentiment: {
      // The plain average of votes cast: this refreshes the number shown right
      // above the vote breakdown, so it must agree with it. The Bayesian score
      // is for ordering only and is never displayed.
      mean: sentiment.raw_mean,
      votes: sentiment.n_votes,
      distribution: sentiment.distribution,
      confidence: sentiment.confidence,
    },
  });
}
