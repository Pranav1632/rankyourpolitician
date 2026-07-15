import { NextResponse } from 'next/server';
import { getAllRatings } from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live ratings for every rated leader, keyed by person id. The rankings
 *  explorer fetches this once alongside the static rankings.json so the
 *  "sort by rating" view reflects real votes (the static payload never
 *  carries vote data). Mirrors GET /api/vote: served from the in-process
 *  TTL-cached aggregates (zero extra Firestore reads) and CDN-cached for
 *  5 minutes, so most page views never invoke the function. */
export async function GET() {
  const ratings = await getAllRatings();
  return NextResponse.json(
    { ok: true, ratings },
    { headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } },
  );
}
