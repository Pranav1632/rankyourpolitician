import { NextRequest, NextResponse } from 'next/server';
import { getTrending } from '@/lib/data';
import { TRENDING_WINDOW_DAYS } from '@/lib/trending';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Trending leaders - ranked by time-decayed rating activity over the last
 *  week. The homepage fetches this only when the Trending tab is opened, so
 *  the page itself stays a static ISR serve. Mirrors GET /api/vote: served
 *  from the in-process TTL-cached aggregates (zero extra Firestore reads) and
 *  CDN-cached for 5 minutes, so most opens never invoke the function. */
export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(12, Math.max(1, Math.floor(raw))) : 5;

  const entries = await getTrending(limit);
  return NextResponse.json(
    { ok: true, windowDays: TRENDING_WINDOW_DAYS, entries },
    { headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } },
  );
}
