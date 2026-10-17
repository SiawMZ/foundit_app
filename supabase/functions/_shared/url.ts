// Shared by the app (src/) and the edge functions. Keep it free of Deno / React Native APIs.

export type Platform =
  | 'instagram'
  | 'tiktok'
  | 'xiaohongshu'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'threads'
  | 'reddit'
  | 'web';

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  xiaohongshu: 'Xiaohongshu',
  facebook: 'Facebook',
  youtube: 'YouTube',
  x: 'X',
  threads: 'Threads',
  reddit: 'Reddit',
  web: 'Web',
};

const PLATFORM_HOSTS: [Platform, string[]][] = [
  ['instagram', ['instagram.com', 'instagr.am']],
  ['tiktok', ['tiktok.com', 'tiktokv.com']],
  ['xiaohongshu', ['xiaohongshu.com', 'xhslink.com']],
  ['facebook', ['facebook.com', 'fb.com', 'fb.watch']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['x', ['x.com', 'twitter.com']],
  ['threads', ['threads.net', 'threads.com']],
  ['reddit', ['reddit.com', 'redd.it']],
];

/** Query params that only track the share, never identify the post. Used for the dedupe key only. */
const TRACKING_PARAMS = [
  /^utm_/,
  /^share_/,
  /^xsec_/,
  /^igsh/,
  /^(si|fbclid|gclid|mibextid|rdid|_r|_t|apptime|app_platform|app_version|author_share|sender_device|is_from_webapp|share_from_user_hidden)$/,
];

/** First http(s) URL in a piece of shared text ("Look at this! https://… copy and open…"). */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"'，。！？、）)\]】]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;:!?]+$/, '');
}

/**
 * Only plain web links are ever opened or fetched. Saved rows can be written straight through the
 * API, so a `javascript:`, `intent:` or `file:` URL must never reach window.open / Linking / fetch.
 */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function detectPlatform(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'web';
  }
  for (const [platform, hosts] of PLATFORM_HOSTS) {
    if (hosts.some((h) => host === h || host.endsWith('.' + h))) return platform;
  }
  return 'web';
}

/** Stable key for duplicate detection: lowercase host without www/m, no tracking params, no hash or trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((re) => re.test(key))) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    const s = u.toString();
    return s.endsWith('/') ? s.slice(0, -1) : s;
  } catch {
    return url.trim();
  }
}

/** Shared text minus the URL itself — often holds the post title (Xiaohongshu, TikTok). */
export function textWithoutUrl(text: string, url: string): string {
  return text.replace(url, '').replace(/\s+/g, ' ').trim();
}
