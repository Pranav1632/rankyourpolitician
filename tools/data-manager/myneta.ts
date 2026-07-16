/**
 * Shared MyNeta (ADR) scraping helpers.
 *
 * MyNeta publishes the self-sworn Form-26 affidavits candidates file with the
 * Election Commission. Two things about the site drive this module's design:
 *
 *  1. THE SUMMARY LISTS ARE INCOMPLETE. `subAction=winner_analyzed` renders the
 *     assets/liabilities columns as IMAGES (image_v2.php?...&col=ta) for a large
 *     minority of candidates, and those rows are simply absent from the text
 *     list - Lok Sabha 2024 returns 483 of 543 winners that way. Scraping the
 *     summary therefore silently drops ~1 member in 8. The per-seat page
 *     (`action=show_candidates&constituency_id=N`) instead marks the winner
 *     explicitly and exists for every seat, so we enumerate seats, not lists.
 *
 *  2. WE MUST PARSE THE PAGE WE CITE. The candidate detail page and the summary
 *     list disagree on some figures (e.g. LokSabha2024 cand 6620 - list says
 *     liabilities Rs 2,98,63,859, the detail page says Rs 2,98,63,912.80). We
 *     cite candidate.php, so we read the value from candidate.php - a reader who
 *     follows our source link sees exactly the number we printed.
 */
import type { Fact } from '../../lib/types';

export const UA = 'Mozilla/5.0 (RankYourPolitician civic-info; vikas070696@gmail.com)';

/** Fetch with retries. `null` means "not found" or "gave up" - never throws. */
export async function getHtml(url: string, tries = 4): Promise<string | null> {
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch { /* network hiccup - retry */ }
    await new Promise((s) => setTimeout(s, 600 * (a + 1)));
  }
  return null;
}

export const clean = (s: string) =>
  (s || '').replace(/&nbsp;?/gi, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Normalise a MyNeta money cell to the dataset's format.
 *   "Rs 15,05,37,706 ~15 Crore+"  -> "₹15,05,37,706 (~15 Crore)"
 *   "Rs 68,27,489 68 Lacs+"       -> "₹68,27,489 (~68 Lacs)"   (grand-total cell)
 *   "Nil"                         -> "₹0"
 * Returns null when the cell carries no figure (e.g. it was rendered as an
 * image) - the caller then skips the field rather than inventing a zero.
 */
export function money(raw: string): string | null {
  const t = clean(raw);
  if (!t) return null;
  if (/^nil$/i.test(t)) return '₹0';
  // ANCHORED at the start. Unanchored, this happily read a rupee figure out of
  // any cell containing a number - money("Others 72") returned "₹72" - so a
  // mis-targeted selector would publish a fabricated amount instead of failing.
  // A money cell always begins with "Rs" or with the digits themselves.
  const m = t.match(/^Rs\.?\s*([\d,]+)/i) || t.match(/^([\d,]{3,})/);
  if (!m) return null;
  const num = '₹' + m[1]; // affidavits are stated in whole rupees; drop any paise
  // The magnitude hint appears either as "~15 Crore+" or bare "68 Lacs+".
  const ap = t.match(/([\d.]+)\s*(Thou|Lacs|Crore|Hazaar|Arab)\+?/i);
  return ap ? `${num} (~${ap[1]} ${ap[2]})` : num;
}

/** State key: "DELHI (NCT) Lok Sabha 2024" and "Delhi" both -> "delhi". */
export const stateKey = (s: string) =>
  (s || '')
    .replace(/BYE ELECTION[^:]*:/i, ' ')
    .replace(/\b(Lok Sabha|Vidhan Sabha|Assembly)\b\s*\d{4}/gi, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
};

/**
 * Seat key: collapse case/punctuation and MyNeta's (SC)/(ST) reservation suffix.
 *
 * Sub-numbered seats are written with ROMAN numerals by MyNeta ("AIZAWL NORTH-II
 * (ST)") and ARABIC digits by our roster ("Aizawl North 2"), so a trailing
 * numeral is normalised to a digit. Without this the two never key-match, every
 * such seat falls through to fuzzy seat matching, and "Aizawl North 2" sits
 * exactly 1 edit from "AIZAWL NORTH-I" but 2 from its own "AIZAWL NORTH-II" -
 * i.e. the fuzzy path prefers the WRONG seat, and did.
 */
export const consKey = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:sc|st|bl|gen)\)/g, ' ')
    .replace(/[-\s]+(i{1,3}|iv|vi{0,3}|ix|x)\s*$/, (_m, r: string) => ' ' + ROMAN[r])
    .replace(/&/g, ' and ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

/**
 * Are two seat keys close enough to be the same seat?
 *
 * Sub-numbered seats are the trap: "aizawlnorth1" and "aizawlnorth2" are ONE
 * character apart (8% of the string) yet are different seats with different
 * MLAs, so any pure edit-distance threshold loose enough to absorb real spelling
 * variance also fuses them. The number is therefore compared exactly and first;
 * only the wording around it is allowed to be fuzzy.
 */
export function seatClose(a: string, b: string): boolean {
  if (a === b) return true;
  const na = (a.match(/(\d+)$/) || [])[1] ?? null;
  const nb = (b.match(/(\d+)$/) || [])[1] ?? null;
  if (na !== nb) return false; // "Aizawl North 1" is never "Aizawl North 2"
  // Distance RELATIVE to length, with no small absolute cap. Measured over the
  // real seat pairs (myneta.regress.ts): genuine spellings of one seat land at
  // 0.08-0.24 (burdwandurgapur/bardhamandurgapur is 4 edits = 0.235), while
  // different seats start at 0.43 (mudhole/andole) - so the ratio separates them
  // cleanly and an absolute "<=3 edits" would only reject the long true pairs.
  const d = lev(a, b);
  return d <= 6 && d / Math.max(a.length, b.length) <= 0.25;
}

const HONORIFICS =
  /\b(dr|adv|advocate|shri|sri|smt|kumari|selvi|thiru|tmt|mr|mrs|ms|prof|er|md|mohd|mohammad|mohammed|syed|alhaj|haji|col|capt|maj|lt|late)\b/g;

/**
 * Strip the honorific suffixes Indian rosters attach inconsistently - Gujarati
 * -bhai/-ben, and -kumar/-ji/-lal - so "Bhupendrabhai" and "Bhupendra", or
 * "Akshaykumar" and "Akshay", are the same token. Only applied when a real stem
 * (>=3 chars) survives, so the standalone surnames "Kumar", "Lal" and "Ben" are
 * left alone.
 */
const SUFFIX = /(bhai|ben|kumar|ji|lal)$/;
const stripSuffix = (t: string): string => {
  const m = t.match(SUFFIX);
  if (!m) return t;
  const stem = t.slice(0, -m[1].length);
  return stem.length >= 3 ? stem : t;
};

/**
 * The single-letter initials in a name, sorted. "V. K. Ramkumar" -> ["k","v"].
 * Honorifics are stripped first so "Dr K. Sudhakar" does not contribute a "d".
 */
export const initials = (s: string): string[] =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(HONORIFICS, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length === 1)
    .sort();

/** Name tokens. Parentheticals and "alias" nicknames are kept as ALTERNATES by
 *  nameVariants() rather than dropped - "Ravindra Shukla Alias Ravi Kishan" must
 *  still match the seed's "Ravi Kishan". */
export const nameTokens = (s: string): string[] =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(HONORIFICS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1)
    .map(stripSuffix);

/** Every plausible reading of a MyNeta name: the whole string, each side of an
 *  "alias", and the parenthetical nickname if present. */
export function nameVariants(s: string): string[] {
  const out = new Set<string>();
  const base = (s || '').replace(/\s*\bwinner\b\s*$/i, '').trim();
  out.add(base);
  const alias = base.split(/\balias\b/i);
  if (alias.length > 1) alias.forEach((p) => out.add(p.trim()));
  const paren = base.match(/\((.+?)\)/);
  if (paren) { out.add(paren[1].trim()); out.add(base.replace(/\(.*?\)/g, ' ').trim()); }
  return [...out].filter(Boolean);
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
export { lev };

/** Jaccard token overlap of the best variant pair. */
export function nameScore(a: string, b: string): number {
  let best = 0;
  for (const va of nameVariants(a)) for (const vb of nameVariants(b)) {
    const A = new Set(nameTokens(va)), B = new Set(nameTokens(vb));
    if (!A.size || !B.size) continue;
    let inter = 0; for (const t of A) if (B.has(t)) inter++;
    best = Math.max(best, inter / (A.size + B.size - inter));
  }
  return best;
}

/**
 * Consonant skeleton for romanised Indic names. Roman spellings of the same
 * name vary in ways that are purely orthographic, so normalise those away:
 * aspiration (th/t, dh/d, ch/c), the t/d and k/g pairs Dravidian names alternate
 * freely between, v/w, doubled letters, and vowels entirely.
 *   "Sachidanandam" and "Sachithanantham" both -> "sktntm"
 * Distinct names stay distinct (Patel -> "ptl" vs Badal -> "ptl"? no: b->p,
 * d->t gives "ptl" both - which is why this is ONLY ever a tie-breaker on an
 * already seat-anchored comparison, never a lookup key).
 */
export const translitKey = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/(kh|gh|ch|jh|th|dh|ph|bh|sh|zh)/g, (m) => m[0]) // drop aspiration
    .replace(/[dt]/g, 't')
    .replace(/[kgq]/g, 'k')
    .replace(/[bpf]/g, 'p')
    .replace(/[vw]/g, 'v')
    .replace(/[cjsz]/g, 's')
    .replace(/[aeiouy]/g, '')
    .replace(/(.)\1+/g, '$1'); // collapse doubles

/**
 * Do two names plausibly denote the same person? Tolerates transliteration
 * (Chauhan/Chouhan, Halder/Haldar), reordering (Sachidanandam R / R.
 * Sachidanandam), aliases, and one-sided extra given names (seed "Suresh
 * Mhatre" vs "Suresh Gopinath Mhatre Alias Balya Mama").
 *
 * ONLY safe when the comparison is already anchored to a single seat/state -
 * it is deliberately lenient and must never be used to pick a person out of a
 * national pool.
 */
export function nameMatches(a: string, b: string): boolean {
  for (const va of nameVariants(a)) for (const vb of nameVariants(b)) {
    const A = new Set(nameTokens(va)), B = new Set(nameTokens(vb));
    if (!A.size || !B.size) continue;
    // Initials are DATA, not noise. nameTokens drops single letters, which makes
    // "P. Karthikeyan" and "V. Karthikeyan" identical - they are two different
    // Puducherry MLAs, and they were fused. When both names carry initials, they
    // must agree exactly; when only one side has them there is nothing to
    // contradict ("C. Damodar Rajanarsimha" vs "Damodar Raja Narasimha").
    const ia = initials(va), ib = initials(vb);
    if (ia.length && ib.length && ia.join('') !== ib.join('')) continue;
    let inter = 0; for (const t of A) if (B.has(t)) inter++;
    const jac = inter / (A.size + B.size - inter);
    // >0.5, not >=0.5: at exactly 0.5 two of four tokens agree, which for Indian
    // names is routinely just a shared "Kumar Singh" - "Vijay Kumar Singh" and
    // "Ajay Kumar Singh" are different people. Genuine variants of one name are
    // caught below by the per-token and skeleton rules instead.
    if (jac > 0.5) return true;
    // Subset: every token of the shorter name appears in the longer one.
    const [small, big] = A.size <= B.size ? [A, B] : [B, A];
    if ([...small].every((t) => big.has(t))) return true;
    // NOTE: there is deliberately no "compact edit distance" rule here. One used
    // to sit at this point, accepting <=2 edits over the whole name once it was
    // >=12 chars, on the theory that a couple of letters cannot flip identity in
    // a long name. They can: "Vanlalhlana" and "Vanlalthlana" are one edit apart
    // at exactly 12 chars and are two DIFFERENT sitting Mizoram MLAs, in adjacent
    // seats. That rule fired before the skeleton check below and overrode it -
    // the skeletons (vnlhln vs vnltln) correctly disagree. Any fuzzy acceptance
    // must go through the skeleton, which is the only test that distinguishes
    // romanisation noise from a changed consonant.
    // Per-token pairing: EVERY token of the shorter name has a twin in the
    // other - either identical, or the same name spelled differently.
    //
    // "Spelled differently" means the same consonant skeleton, NOT a small edit
    // distance. That distinction is the whole ballgame: "Karshan"/"Karsan" and
    // "Mohammed"/"Muhammed" are one edit apart AND share a skeleton (the
    // difference is aspiration/vowels - pure romanisation), while
    // "Sunita"/"Sarita" and "Anil"/"Sunil" are also one edit apart but have
    // DIFFERENT skeletons, because a consonant changed - they are different
    // people. An edit-distance threshold cannot separate those two cases; a
    // skeleton comparison can.
    //
    // All tokens must pair, not most: at 2-of-3, "Ram Rao Pawar" pairs with
    // "Damodar Raja Narasimha" on ram~raja and rao~raja alone - which is exactly
    // how Ram Rao Pawar's criminal record was once attached to the MLA for
    // Andole.
    const sm = [...small], bg = [...big];
    const skel = new Map(bg.map((u) => [u, translitKey(u)]));
    const near = sm.filter((t) => {
      const kt = translitKey(t);
      return bg.some((u) => u === t || (kt.length >= 2 && kt === skel.get(u)));
    });
    if (sm.length >= 2 && near.length === sm.length) return true;
    // Same name, different romanisation (Sachidanandam / Sachithanantham).
    // Per token, then sorted, so word order does not matter ("R. Sachidanandam"
    // vs "Sachithanantham R").
    const ka = [...A].map(translitKey).filter(Boolean).sort().join(' ');
    const kb = [...B].map(translitKey).filter(Boolean).sort().join(' ');
    if (ka && kb && ka.length >= 4 && kb.length >= 4) {
      const d = lev(ka, kb);
      // Skeletons are short and information-dense: one edit apart is a DIFFERENT
      // name ("Anil Kumar" -> "kmr nl" vs "Sunil Kumar" -> "kmr snl"). Demand an
      // exact skeleton, and allow slack only on long ones where a single
      // consonant is a smaller share of the evidence.
      if (d === 0) return true;
      if (Math.max(ka.length, kb.length) >= 12 && d / Math.max(ka.length, kb.length) <= 0.12) return true;
    }
    // Same name, different word breaks ("Aduram Meghwal" / "ADU RAM MEGHWAL").
    // Compare the whole-name skeleton with token boundaries removed.
    const ja = translitKey([...A].join('')), jb = translitKey([...B].join(''));
    if (ja && jb && ja.length >= 5 && ja === jb) return true;
    // Word breaks AND reordering ("Mandali Buddha Prasad" / "Buddhaprasad
    // Mandali", "Nimmakayala Chinarajappa" / "China Rajappa Nimmakayala"):
    // every substantial token of the shorter name appears somewhere inside the
    // other name's unbroken form. Tokens under 4 chars are ignored as evidence
    // but still have to be accounted for, so "Ajay Dangi" can never match
    // "Ajay Kumar" on the shared given name alone.
    const joined = [...(A.size <= B.size ? B : A)].join('');
    const shorter = A.size <= B.size ? A : B;
    const solid = [...shorter].filter((t) => t.length >= 4);
    if (solid.length >= 2 && solid.length === shorter.size && solid.every((t) => joined.includes(t))) return true;
  }
  return false;
}

/**
 * "Could these two names denote the same person?" - the AUDIT counterpart to
 * nameMatches, and deliberately much weaker.
 *
 * The two ask different questions. nameMatches decides whether we may CREATE a
 * join, so it must refuse anything unproven. This decides whether an EXISTING
 * join looks impossible, so it must not cry wolf over romanisation noise
 * ("Naushad Siddiqui" / "MD NAWSAD SIDDIQUE", "Rajbir Singh Fartiya" / "RAJBIR
 * FARTIA" are the same MLAs). It answers false only when the two names share
 * almost nothing - the signature of a genuinely wrong join.
 */
export function nameCouldBeSame(a: string, b: string): boolean {
  if (nameMatches(a, b)) return true;
  for (const va of nameVariants(a)) for (const vb of nameVariants(b)) {
    const A = new Set(nameTokens(va)), B = new Set(nameTokens(vb));
    if (!A.size || !B.size) continue;
    // Any one substantial token in common.
    for (const t of A) if (t.length >= 4 && B.has(t)) return true;
    // Or any pair of tokens with the same consonant skeleton (Siddiqui/Siddique,
    // Sanghavi/Sanghvi, Fartiya/Fartia, Chetri/Chhetri).
    const ka = [...A].map(translitKey).filter((k) => k.length >= 3);
    const kb = new Set([...B].map(translitKey).filter((k) => k.length >= 3));
    for (const k of ka) if (kb.has(k)) return true;
    // Or the whole names collapse to near-identical skeletons.
    const ja = translitKey([...A].join('')), jb = translitKey([...B].join(''));
    if (ja.length >= 5 && jb.length >= 5) {
      const d = lev(ja, jb);
      if (d / Math.max(ja.length, jb.length) <= 0.34) return true;
    }
  }
  return false;
}

export interface SeatRow {
  constituencyId: number;
  cons: string;
  state: string;
  isBye: boolean;
  winner: { candidateId: string; name: string; party: string } | null;
}

/** Parse `action=show_candidates&constituency_id=N`: the seat, its state, and
 *  the row explicitly flagged "Winner". Returns null for a Page-Not-Found id. */
export function parseSeatPage(html: string, constituencyId: number): SeatRow | null {
  const title = clean((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const m = title.match(/List of Candidates in (.+?)\s*:\s*(.+)$/i);
  if (!m) return null;
  let winner: SeatRow['winner'] = null;
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const idm = tr.match(/candidate_id=(\d+)/);
    if (!idm) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => clean(x[1]));
    if (cells.length < 3) continue;
    if (!/\bwinner\b/i.test(cells[1])) continue;
    winner = {
      candidateId: idm[1],
      name: cells[1].replace(/\s*\bwinner\b\s*$/i, '').trim(),
      party: cells[2] || '',
    };
  }
  return { constituencyId, cons: m[1].trim(), state: m[2].trim(), isBye: /BYE ELECTION/i.test(m[2]), winner };
}

export interface Affidavit {
  assets_total?: string;
  liabilities_total?: string;
  criminal_cases_declared?: string;
  education?: string;
  age?: string;
}

/**
 * A MyNeta money cell -> rupees, PAISE INCLUDED ("Rs 2,98,63,858.80 2 Crore+"
 * -> 298638858.8). Anchored, so a stray number elsewhere in the cell cannot be
 * read as an amount, and "Nil"/absent -> 0. Callers sum these and round once,
 * which is what MyNeta's own summary lists print - truncating instead left our
 * figures a rupee short of every affidavit that declares paise.
 */
export function rupees(v: string | null | undefined): number {
  if (!v) return 0;
  const t = clean(v);
  if (/^nil$/i.test(t)) return 0;
  const m = t.match(/^(?:Rs\.?\s*|₹\s*)([\d,]+(?:\.\d+)?)/i) || t.match(/^([\d,]{3,}(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 57394347 -> "5,73,94,347" (Indian grouping: last 3, then pairs). */
function indianGroup(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const head = s.slice(0, -3), tail = s.slice(-3);
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
}

/** 57394347 -> "₹5,73,94,347 (~5 Crore)" - the dataset's existing format. */
export function formatRupees(n: number): string {
  const num = '₹' + indianGroup(n);
  if (n >= 1e7) return `${num} (~${Math.floor(n / 1e7)} Crore)`;
  if (n >= 1e5) return `${num} (~${Math.floor(n / 1e5)} Lacs)`;
  if (n >= 1e3) return `${num} (~${Math.floor(n / 1e3)} Thou)`;
  return num;
}

/** Cells of every <tr> on the page, tags stripped. */
function tableRows(html: string): string[][] {
  return (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).map((tr) =>
    [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => clean(x[1])),
  );
}

/**
 * Parse a candidate detail page. Returns ONLY what the page actually states -
 * a field the affidavit does not carry is simply absent, never zero-filled.
 *
 * LIABILITIES ARE DELIBERATELY *NOT* READ FROM THE PAGE HEADER. MyNeta's
 * "Assets & Liabilities" box prints its own arithmetic - the itemised table's
 * "Totals (Calculated as Sum of Values)" - which for ~1 candidate in 6 differs
 * from the figure the candidate actually swore to. Himachal 2022 cand 179:
 * header says Rs 94,97,928, the affidavit's own "Grand Total of Liabilities
 * (as per affidavit)" says Rs 68,27,489. We publish declared values, so we take
 * the affidavit row. (Assets have no such split: the header there is simply
 * movable + immovable and agrees with the affidavit and the summary list.)
 */
export function parseCandidatePage(html: string): Affidavit {
  const out: Affidavit = {};

  // Assets and the header liabilities: anchor on the section heading so the
  // "Other Elections Declaration" table (which lists PRIOR elections' assets)
  // can never be read as this affidavit's figures.
  let headerLiab: string | null = null;
  const sec = html.search(/<h3>\s*Assets\s*(?:&amp;|&)\s*Liabilities/i);
  if (sec >= 0) {
    const block = html.slice(sec, sec + 1800);
    const am = block.match(/Assets:\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    const lm = block.match(/Liabilities:\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    const a = am ? money(am[1]) : null;
    if (a) out.assets_total = a; // header assets = movable + immovable; agrees with the affidavit
    headerLiab = lm ? money(lm[1]) : null; // header liabilities = MyNeta's own recomputed sum
  }

  // Liabilities = the candidate's OWN declared totals, summed across BOTH
  // declared sections:
  //   (i)   "Grand Total of Liabilities (as per affidavit)"   - loans only
  //   (iii) "Grand Total of all Govt Dues (as per affidavit)" - government dues
  // Reading only (i) silently drops the dues: LokSabha2024 cand 9560 declares
  // Rs 1,23,94,347 of loans AND Rs 4,50,00,000 of dues, and his true declared
  // liability is the Rs 5,73,94,347 sum. This is also what MyNeta's own summary
  // lists print, so the two agree.
  //
  // NOT the page header. The header prints "Totals (Calculated as Sum of
  // Values)" - MyNeta's own arithmetic over the line items, which disagrees with
  // the declared totals for ~1 candidate in 6 (Himachal 2022 cand 179: declared
  // 68,27,489, header 94,97,928; cand 9560: header 6,23,04,347 vs declared
  // 5,73,94,347). We publish declared values.
  //
  // The header IS the right fallback when BOTH declared totals read "Nil" while
  // line items plainly exist - some affidavits itemise loans and leave the total
  // box blank (Tripura 2023 cand 6983: ~50 Lacs of loans under a Nil total), and
  // printing ₹0 there would understate real declared debt.
  const rows = tableRows(html);
  const totalRow = (re: RegExp) => {
    const i = rows.findIndex((c) => re.test(c.join('|')));
    return i >= 0 ? rows[i][rows[i].length - 1] : null;
  };
  const loans = totalRow(/Grand Total of Liabilities \(as per affidavit\)/i);
  const dues = totalRow(/Grand Total of all Govt Dues \(as per affidavit\)/i);
  if (loans !== null || dues !== null) {
    // Sum the raw cells (paise and all), then round once - see rupees().
    const declared = Math.round(rupees(loans) + rupees(dues));
    if (declared > 0) out.liabilities_total = formatRupees(declared);
    else if (headerLiab && headerLiab !== '₹0') out.liabilities_total = headerLiab;
    else out.liabilities_total = '₹0';
  }

  const txt = clean(html);
  const cm = txt.match(/Number of Criminal Cases:\s*(\d+)/i);
  if (cm) out.criminal_cases_declared = cm[1];
  else if (/No criminal cases/i.test(txt)) out.criminal_cases_declared = '0';

  const em = html.match(/<h3>\s*Educational Details\s*<\/h3>\s*<hr>\s*Category:\s*([^<]+)/i);
  if (em) {
    const v = clean(em[1]);
    if (v && !/^(nan|n\/?a|not given|others?|-)$/i.test(v)) out.education = v;
  }
  const gm = txt.match(/\bAge:\s*(\d{1,3})\b/);
  if (gm && +gm[1] > 0 && +gm[1] < 120) out.age = gm[1];

  return out;
}

// ---- Criminal-case detail (the "Details of Criminal Cases" section) --------
import type { CriminalCharge, CriminalCase, CriminalCaseStatus } from '../../lib/types';

export interface CriminalDetail {
  /** The page's "Number of Criminal Cases" figure; undefined when unstated. */
  declared_total?: number;
  charges: CriminalCharge[];
  cases: CriminalCase[];
}

/** Candidate name from the page <title>:
 *  "Gottipati Ravi Kumar(TDP):Constituency- ADDANKI(PRAKASAM) - Affidavit..." */
export function candidateTitleName(html: string): string | null {
  const t = clean((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const name = t.split('(')[0].trim();
  return name || null;
}

/** Constituency from the page <title>, district parenthetical stripped:
 *  "...Constituency- ADDANKI(PRAKASAM) - Affidavit..." -> "ADDANKI". */
export function candidateTitleSeat(html: string): string | null {
  const t = clean((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const m = t.match(/Constituency-?\s*(.+?)\s*-\s*Affidavit/i);
  if (!m) return null;
  // The trailing parenthetical is the district; earlier ones ((SC)/(ST)) are
  // reservation markers that consKey already ignores.
  const seat = m[1].replace(/\s*\([^()]*\)\s*$/, '').trim();
  return seat || null;
}

/** Cells of every <tr> inside one html slice, tags stripped. */
function sliceRows(html: string): string[][] {
  return (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).map((tr) =>
    [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => clean(x[1])),
  );
}

/** Header cell text -> CriminalCase field. Column layouts differ by vintage
 *  (2026 pages add a "LAW / Section Type" column; convicted tables swap the
 *  charges-framed columns for punishment/conviction-date), so columns are
 *  mapped by their own header text, never by position. */
function caseColumn(header: string): keyof CriminalCase | 'serial' | null {
  const h = header.toLowerCase();
  if (/^serial/.test(h)) return 'serial';
  if (/^fir/.test(h)) return 'fir_no';
  if (/^case no/.test(h)) return 'case_no';
  if (/^court/.test(h)) return 'court';
  if (/law.*type/.test(h)) return 'law';
  if (/sections applicable/.test(h) && !/other/.test(h)) return 'sections';
  if (/^other details/.test(h)) return 'other_sections';
  if (/^charges framed/.test(h)) return 'charges_framed';
  if (/date on which charges/.test(h)) return 'framed_date';
  if (/punishment/.test(h)) return 'punishment';
  if (/date on which convicted/.test(h)) return 'convicted_date';
  if (/^appeal filed/.test(h)) return 'appeal_filed';
  if (/status of appeal/.test(h)) return 'appeal_details';
  return null;
}

/**
 * Parse the "Details of Criminal Cases" section of a candidate page: the
 * "Brief Details of IPC / BNS" charge summary plus every "Cases where X"
 * table (Pending / Convicted / Cognizance Taken...). Everything is stored
 * verbatim from the page - a cell the affidavit leaves blank is absent,
 * never invented. Returns empty lists when the page has no such section.
 */
export function parseCriminalDetail(html: string): CriminalDetail {
  const out: CriminalDetail = { charges: [], cases: [] };

  const txt = clean(html);
  const cm = txt.match(/Number of Criminal Cases:\s*(\d+)/i);
  if (cm) out.declared_total = parseInt(cm[1], 10);
  else if (/No criminal cases/i.test(txt)) out.declared_total = 0;

  // Charge summary: the <ul> lists between the "Brief Details" heading and the
  // first case table (or end of section). Item shape:
  //   "8 charges related to Punishment for wrongful restraint (IPC Section-341)"
  // The section token may itself contain parentheses ("191(2)"), so the law
  // marker is located with lastIndexOf, not a regex across nested parens.
  const briefAt = html.search(/Brief Details of IPC/i);
  if (briefAt >= 0) {
    const end = html.slice(briefAt).search(/<h3>\s*Cases where|<div class='w3-panel w3-leftbar w3-sand'>(?![\s\S]{0,80}Criminal)/i);
    const block = end > 0 ? html.slice(briefAt, briefAt + end) : html.slice(briefAt, briefAt + 20000);
    for (const li of block.match(/<li>[\s\S]*?(?=<li>|<\/ul>)/gi) || []) {
      const item = clean(li);
      const m = item.match(/^(\d+)\s+charges?\s+related to\s+(.+)$/i);
      if (!m) continue;
      const count = parseInt(m[1], 10);
      const rest = m[2].trim();
      const ipcAt = rest.toUpperCase().lastIndexOf('(IPC SECTION');
      const bnsAt = rest.toUpperCase().lastIndexOf('(BNS SECTION');
      const at = Math.max(ipcAt, bnsAt);
      if (at >= 0) {
        const law = at === ipcAt ? 'IPC' : 'BNS';
        const sec = rest.slice(at).replace(/^\((?:IPC|BNS)\s*Section-?\s*/i, '').replace(/\)\s*$/, '').trim();
        const description = rest.slice(0, at).trim();
        out.charges.push({ count, description: description || sec, law, section: sec });
      } else {
        // No parseable statute marker - keep the text, claim no section.
        out.charges.push({ count, description: rest, law: '', section: '' });
      }
    }
  }

  // Case tables: one per "Cases where X" heading.
  const heads = [...html.matchAll(/<h3>\s*Cases where\s+([^<]+?)\s*<\/h3>/gi)];
  heads.forEach((h, i) => {
    const label = clean(h[1]);
    const start = h.index! + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : html.length;
    const slice = html.slice(start, end);
    const tableAt = slice.search(/<table id=cases/i);
    if (tableAt < 0) return;
    const table = slice.slice(tableAt, slice.indexOf('</table>', tableAt) + 9);
    const rows = sliceRows(table);
    if (rows.length < 2) return;
    const cols = rows[0].map(caseColumn);
    const status: CriminalCaseStatus = /convict/i.test(label) ? 'convicted' : /pending/i.test(label) ? 'pending' : 'other';
    // The sections cell's statute: older tables title it "IPC Sections
    // Applicable" (statute in the header); 2026 tables title it "IPC/BNS
    // Sections Applicable" with the statute in the row's LAW column.
    const sectionsIdx = cols.indexOf('sections');
    const headerLaw = sectionsIdx >= 0 && /ipc\s*\/\s*bns/i.test(rows[0][sectionsIdx]) ? null : 'IPC';
    for (const row of rows.slice(1)) {
      const c: CriminalCase = { status, status_label: label };
      row.forEach((cell, j) => {
        const field = cols[j];
        if (!field || field === 'serial' || !cell) return;
        (c as any)[field] = cell;
      });
      // A row with no substance (all mapped cells blank) is layout noise.
      if (!c.fir_no && !c.case_no && !c.court && !c.sections && !c.other_sections) continue;
      if (c.sections && !c.law && headerLaw) c.law = headerLaw;
      out.cases.push(c);
    }
  });

  return out;
}

/** Add a fact only if that field_type is absent - curated data always wins. */
export function fillFact(facts: Fact[], field_type: string, value: string, cite: Omit<Fact, 'field_type' | 'value'>): boolean {
  if (facts.some((f) => f.field_type === field_type)) return false;
  facts.push({ field_type, value, ...cite });
  return true;
}

/** Bounded-concurrency map that preserves input order. */
export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
