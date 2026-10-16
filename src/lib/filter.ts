import type { Platform } from '../../supabase/functions/_shared/url';
import type { Link } from './types';

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

export function applyFilter(links: Link[], f: LinkFilter): Link[] {
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

  const byName = (a: Link, b: Link) =>
    displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' });
  const compare: Record<SortKey, (a: Link, b: Link) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    az: byName,
    za: (a, b) => byName(b, a),
  };
  // Pinned links always stay on top.
  return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[f.sort](a, b));
}

/** Labels ordered by how often they're used. */
export function labelCounts(links: Link[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of links) for (const label of l.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
