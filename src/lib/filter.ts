import type { Platform } from '../../supabase/functions/_shared/url';
import type { LibraryLink, Link } from './types';

export type SortKey = 'newest' | 'oldest' | 'az' | 'za';

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'Name A–Z',
  za: 'Name Z–A',
};

/** folder: undefined = all, null = unfiled, string = that folder. */
export type LinkFilter = {
  query: string;
  platform: Platform | null;
  folder: string | null | undefined;
  label: string | null;
  sort: SortKey;
};

export const EMPTY_FILTER: LinkFilter = {
  query: '',
  platform: null,
  folder: undefined,
  label: null,
  sort: 'newest',
};

export function displayTitle(link: Link) {
  return link.title || link.shared_text || link.resolved_url || link.url;
}

export function applyFilter<T extends Link>(links: T[], f: LinkFilter): T[] {
  const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = links.filter((l) => {
    if (f.platform && l.platform !== f.platform) return false;
    if (f.folder !== undefined && l.folder_id !== f.folder) return false;
    if (f.label && !l.labels.includes(f.label)) return false;
    if (terms.length) {
      const hay = [l.title, l.description, l.note, l.author, l.shared_text, l.url, ...l.labels]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const byName = (a: T, b: T) =>
    displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' });
  const compare: Record<SortKey, (a: T, b: T) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    az: byName,
    za: (a, b) => byName(b, a),
  };
  // Pinned links always stay on top.
  return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[f.sort](a, b));
}

/** Search terms from the `ask` function (AI search). */
export type AskTerms = { keywords: string[]; labels: string[]; platform: Platform | null };

/**
 * AI search: links that match any keyword or carry any of the labels, most hits first.
 * Nothing matches → []. `base` is already narrowed by the folder/label filters.
 */
export function rankByTerms<T extends Link>(base: T[], terms: AskTerms): T[] {
  const keywords = terms.keywords.map((k) => k.toLowerCase());
  const scored: { link: T; score: number }[] = [];
  for (const l of base) {
    if (terms.platform && l.platform !== terms.platform) continue;
    const hay = [l.title, l.description, l.note, l.author, l.shared_text, l.url, ...l.labels]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    // A matching label counts double: it's the user's own organization.
    const score =
      keywords.filter((k) => hay.includes(k)).length + 2 * terms.labels.filter((t) => l.labels.includes(t)).length;
    if (score > 0) scored.push({ link: l, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.link.pinned) - Number(a.link.pinned) ||
        b.link.created_at.localeCompare(a.link.created_at),
    )
    .map((s) => s.link);
}

/** Labels ordered by how often they're used. */
export function labelCounts(links: Link[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of links) for (const label of l.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * All links: my links plus other members' links in folders I share, one card per post.
 * My own copy wins (outside shared folders first); `inFolders` lists every folder the post is in.
 */
export function mergeLibrary(own: Link[], joined: LibraryLink[], folderNames: Map<string, string>): LibraryLink[] {
  const groups = new Map<string, LibraryLink[]>();
  for (const l of [...own, ...joined]) {
    const group = groups.get(l.normalized_url);
    if (group) group.push(l);
    else groups.set(l.normalized_url, [l]);
  }
  const rank = (l: LibraryLink) => (l.added_by !== undefined ? 2 : l.collab_folder_id ? 1 : 0);
  return [...groups.values()].map((group) => {
    const best = group.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    if (group.length === 1) return best;
    const inFolders = [
      ...new Set(group.map((l) => (l.folder_id ? folderNames.get(l.folder_id) : undefined)).filter((n): n is string => !!n)),
    ];
    return { ...best, inFolders };
  });
}
