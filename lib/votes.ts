// Vote persistence. In Firestore, a deterministic vote-doc id
// (`${politicianId}__${voterKey}`) makes one-vote-per-user atomic; the same
// transaction maintains the aggregate so the displayed score is consistent.
// Without Firestore, an in-process store keeps local dev/voting working.
import { getDb } from './firebase-admin';
import type { VoteAggregate, SentimentScore } from './types';
import { computeSentimentScore } from './ranking';
import { bumpDaily, pruneDaily } from './trending';

const memVotes = new Map<string, Map<string, number>>(); // politicianId -> voterKey -> rating
// politicianId -> day -> rating -> event count (trending signal, dev fallback)
const memDaily = new Map<string, Record<string, Record<string, number>>>();

function aggFromMem(politicianId: string): VoteAggregate {
  const m = memVotes.get(politicianId);
  const counts: Record<string, number> = {};
  let total = 0;
  let sum = 0;
  if (m) {
    for (const rating of m.values()) {
      counts[rating] = (counts[rating] || 0) + 1;
      total++;
      sum += rating;
    }
  }
  const daily = memDaily.get(politicianId);
  return { politician_id: politicianId, counts, total, sum, updated_at: new Date().toISOString(), ...(daily ? { daily } : {}) };
}

export async function recordVote(
  politicianId: string,
  key: string,
  rating: number,
): Promise<{ aggregate: VoteAggregate; sentiment: SentimentScore; updated: boolean }> {
  const db = getDb();
  if (!db) {
    const m = memVotes.get(politicianId) ?? new Map<string, number>();
    const updated = m.has(key);
    m.set(key, rating);
    memVotes.set(politicianId, m);
    // Only a genuinely new voter is trending activity; a re-vote is not, or the
    // weekly count would exceed the person's distinct-voter total.
    if (!updated) memDaily.set(politicianId, bumpDaily(memDaily.get(politicianId), new Date(), rating));
    const aggregate = aggFromMem(politicianId);
    return { aggregate, sentiment: computeSentimentScore(politicianId, aggregate), updated };
  }

  const voteRef = db.collection('votes').doc(`${politicianId}__${key}`);
  const aggRef = db.collection('vote_aggregates').doc(politicianId);
  const now = new Date().toISOString();

  const { aggregate, updated } = await db.runTransaction(async (tx) => {
    const [voteSnap, aggSnap] = await Promise.all([tx.get(voteRef), tx.get(aggRef)]);
    const prev = voteSnap.exists ? (voteSnap.data()!.rating as number) : null;
    const data = (aggSnap.exists ? aggSnap.data() : null) as VoteAggregate | null;
    const counts: Record<string, number> = { ...(data?.counts || {}) };
    let total = data?.total || 0;
    let sum = data?.sum || 0;

    if (prev != null) {
      counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
      sum -= prev;
    } else {
      total += 1;
    }
    counts[rating] = (counts[rating] || 0) + 1;
    sum += rating;

    // Trending signal: only a NEW voter (prev == null) is a rating event, so
    // the weekly count can never exceed the person's distinct-voter total - a
    // re-vote is not three ratings. Either way we prune buckets past the
    // retention window so the doc stays bounded.
    const daily =
      prev == null ? bumpDaily(data?.daily, new Date(), rating) : pruneDaily(data?.daily, new Date());

    const newAgg: VoteAggregate = { politician_id: politicianId, counts, total, sum, updated_at: now, daily };
    tx.set(voteRef, { politician_id: politicianId, rating, updated_at: now }, { merge: true });
    tx.set(aggRef, newAgg);
    return { aggregate: newAgg, updated: prev != null };
  });

  return { aggregate, sentiment: computeSentimentScore(politicianId, aggregate), updated };
}

/** Snapshot of the in-process aggregates - the credential-less fallback the
 *  read layer uses instead of Firestore, so locally cast votes flow into
 *  trending and rankings and the site works end to end with zero setup.
 *  Firestore-configured runtimes never call this. */
export function memVoteAggregates(): Map<string, VoteAggregate> {
  const m = new Map<string, VoteAggregate>();
  for (const id of memVotes.keys()) m.set(id, aggFromMem(id));
  return m;
}

export async function getAggregate(politicianId: string): Promise<VoteAggregate | undefined> {
  const db = getDb();
  if (!db) {
    const agg = aggFromMem(politicianId);
    return agg.total > 0 ? agg : undefined;
  }
  try {
    const snap = await db.collection('vote_aggregates').doc(politicianId).get();
    return snap.exists ? (snap.data() as VoteAggregate) : undefined;
  } catch (err) {
    // e.g. free-tier read quota exhausted - degrade to "no ratings" rather than
    // failing the page render.
    console.error('[votes] vote_aggregates read failed:', err);
    return undefined;
  }
}

export async function getSentiment(politicianId: string): Promise<SentimentScore> {
  return computeSentimentScore(politicianId, await getAggregate(politicianId));
}
