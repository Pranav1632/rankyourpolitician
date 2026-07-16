import { NextRequest, NextResponse } from 'next/server';
import { getTrending } from '@/lib/data';
import { TRENDING_WINDOW_DAYS } from '@/lib/trending';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Trending leaders - ranked by time-decayed rating activity over the last
 *  week. The homepage fetches this only when the Trending tab is opened, so
 *  the page itself stays a static ISR serve. Mirrors GET /api/vote: served
 *  from the in-process TTL-cached aggregates (zero extra Firestore reads) and
 *  CDN-cached for 5 minutes, so most opens never invoke the function.
 *
 *  Optional ?state= (2-letter code) and &district= (name) scope the list - the
 *  state/district pages mount the same panel. Scoping filters the same cached
 *  aggregates in memory, and every distinct scope is its own CDN cache key, so
 *  cost per URL is unchanged. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const raw = Number(sp.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(12, Math.max(1, Math.floor(raw))) : 5;

  // Unknown state codes / district names simply match nothing: an empty 200 is
  // CDN-cacheable, so junk params cannot pin the function warm the way an
  // uncacheable 400 would. A district only means something within its state.
  const state = sp.get('state');
  const district = sp.get('district');
  const scope = state ? { stateCode: state, district: district || undefined } : undefined;

  const entries = await getTrending(limit, scope);
  return NextResponse.json(
    { ok: true, windowDays: TRENDING_WINDOW_DAYS, entries },
    { headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } },
  );
}
