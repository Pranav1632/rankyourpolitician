import type { MetadataRoute } from 'next';
import { getAllPersonIds, getIndex, getStates, getDistrictsInState } from '@/lib/data';

// Built once per deploy. Clean (locale-less) URLs are the canonical ones -
// middleware picks the reader's language, so one URL serves every locale.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [idx, states, personIds] = await Promise.all([getIndex(), getStates(), getAllPersonIds()]);

  const urls: MetadataRoute.Sitemap = [
    '',
    '/india',
    '/hierarchy',
    '/rankings',
    '/who',
    '/accountability',
    '/about',
    '/methodology',
    '/grievance',
    '/privacy',
    '/terms',
  ].map((p) => ({ url: `${SITE_URL}${p || '/'}`, changeFrequency: 'daily' as const }));

  for (const s of states) {
    urls.push({ url: `${SITE_URL}/state/${s.stateCode}`, changeFrequency: 'daily' });
    for (const d of await getDistrictsInState(s.stateCode)) {
      urls.push({ url: `${SITE_URL}/district/${s.stateCode}/${encodeURIComponent(d)}`, changeFrequency: 'weekly' });
    }
  }
  for (const c of idx.constituencies) {
    urls.push({ url: `${SITE_URL}/area/${c.id}`, changeFrequency: 'weekly' });
  }
  for (const id of personIds) {
    urls.push({ url: `${SITE_URL}/person/${id}`, changeFrequency: 'weekly' });
  }
  return urls;
}
