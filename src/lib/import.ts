import { detectPlatform, normalizeUrl, type Platform } from '../../supabase/functions/_shared/url';

export type FoundLink = { url: string; normalized: string; platform: Platform };

/**
 * Links that point at a single post, per platform. Data exports also contain profile pages,
 * hashtags, help pages and CDN files; only these patterns are imported.
 */
const POST_PATTERNS: RegExp[] = [
  /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+/i,
  /tiktokv?\.com\/(?:@[\w.-]+\/(?:video|photo)\/\d+|share\/video\/\d+|v\/\d+)/i,
  /(?:vm|vt)\.tiktok\.com\/\w+/i,
  /xiaohongshu\.com\/(?:explore|discovery\/item)\/[0-9a-f]{16,}/i,
  /xhslink\.com\/\w+/i,
  /youtube\.com\/(?:watch\?(?:.*&)?v=[\w-]+|shorts\/[\w-]+)/i,
  /youtu\.be\/[\w-]+/i,
  /facebook\.com\/(?:[\w.]+\/(?:posts|videos)\/|watch\/?\?v=|reel\/|share\/[prv]\/|permalink\.php)/i,
  /fb\.watch\/\w+/i,
  /threads\.(?:net|com)\/@[\w.]+\/post\/[\w-]+/i,
  /(?:twitter|x)\.com\/\w+\/status\/\d+/i,
  /reddit\.com\/r\/\w+\/comments\/\w+/i,
];

/**
 * Finds post links in any text: an Instagram/TikTok data export (JSON or HTML), a CSV, or pasted
 * notes. Handles JSON-escaped slashes and HTML entities. Returns each post once, in file order.
 */
export function extractPostLinks(text: string): FoundLink[] {
  const cleaned = text
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/g, '&');
  const seen = new Set<string>();
  const out: FoundLink[] = [];
  for (const match of cleaned.matchAll(/https?:\/\/[^\s"'<>()[\]{}\\,]+/gi)) {
    const url = match[0].replace(/[.;:!?]+$/, '');
    if (!POST_PATTERNS.some((re) => re.test(url))) continue;
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ url, normalized, platform: detectPlatform(url) });
  }
  return out;
}

/** Web only: lets the user pick one or more files and returns their text. */
export function pickTextFiles(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.html,.htm,.txt,.csv';
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      resolve(await Promise.all(files.map((f) => f.text())));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
