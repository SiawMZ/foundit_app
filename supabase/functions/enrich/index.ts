// Fills in a saved link: resolves short links, fetches a preview, stores the thumbnail,
// and asks Claude for a short description + labels.
// POST { link_id } with the user's Authorization header.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.134';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.134/helpers/zod';
import { z } from 'npm:zod@4';

import { detectPlatform, PLATFORM_NAMES, type Platform } from '../_shared/url.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
// Meta serves Open Graph tags to its own crawler without a login wall.
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 5_000_000;
const MODEL = Deno.env.get('ENRICH_MODEL') ?? 'claude-opus-5-5';

type Preview = {
  resolvedUrl: string;
  title?: string;
  description?: string;
  author?: string;
  image?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'missing authorization' }, 401);

  const { link_id } = await req.json().catch(() => ({}));
  if (typeof link_id !== 'string') return json({ error: 'link_id required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // The user's client goes through RLS, so a user can only enrich their own links.
  const userDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const adminDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: link, error } = await userDb.from('links').select('*').eq('id', link_id).single();
  if (error || !link) return json({ error: 'link not found' }, 404);

  try {
    const preview = await fetchPreview(link.url, link.platform as Platform);
    const platform = link.platform === 'web' ? detectPlatform(preview.resolvedUrl) : link.platform;

    const thumbnail = preview.image
      ? await storeThumbnail(adminDb, preview.image, `${link.user_id}/${link.id}`)
      : null;

    const existingLabels = await userLabels(userDb);
    const ai = await describe({
      platform,
      url: preview.resolvedUrl,
      title: preview.title,
      description: preview.description,
      author: preview.author,
      sharedText: link.shared_text,
      existingLabels,
    });

    const title = link.title ?? ai?.title ?? preview.title ?? null;
    const update = {
      resolved_url: preview.resolvedUrl,
      platform,
      title,
      description: ai?.description ?? truncate(preview.description, 200) ?? null,
      author: preview.author ?? link.author,
      thumbnail_path: thumbnail ?? link.thumbnail_path,
      labels: [...new Set([...(link.labels ?? []), ...(ai?.labels ?? [])])],
      status: title ? 'ready' : 'failed',
      error: title ? null : 'No preview available for this link',
    };
    const { data: saved, error: saveError } = await userDb
      .from('links')
      .update(update)
      .eq('id', link.id)
      .select()
      .single();
    if (saveError) throw saveError;
    return json(saved);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('enrich failed', link.id, message);
    await userDb.from('links').update({ status: 'failed', error: message }).eq('id', link.id);
    return json({ error: message }, 500);
  }
});

// ---------- preview ----------

async function fetchPreview(url: string, platform: Platform): Promise<Preview> {
  // Follow short links (xhslink.com, vm.tiktok.com, fb.watch…) to the real post.
  const ua = platform === 'instagram' || platform === 'facebook' ? CRAWLER_UA : BROWSER_UA;
  let resolvedUrl = url;
  let page: Preview = { resolvedUrl: url };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en,zh;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    // A redirect off the platform is a bot check or login wall (google.com/sorry, …), not the post.
    const leftPlatform = platform !== 'web' && detectPlatform(res.url) !== platform;
    if (res.url && !leftPlatform) resolvedUrl = res.url;
    if (!leftPlatform && res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      page = { resolvedUrl, ...parseMeta(await readLimited(res, MAX_HTML_BYTES), resolvedUrl) };
    } else {
      res.body?.cancel().catch(() => {});
    }
  } catch (e) {
    console.warn('page fetch failed', url, e instanceof Error ? e.message : e);
  }

  const oembed = await fetchOEmbed(detectPlatform(resolvedUrl), resolvedUrl);
  return {
    resolvedUrl,
    title: oembed?.title || page.title,
    description: page.description,
    author: oembed?.author || page.author,
    image: oembed?.image || page.image,
  };
}

/** Public oEmbed endpoints (no app token needed) give cleaner data than page scraping. */
async function fetchOEmbed(platform: Platform, url: string) {
  const endpoint =
    platform === 'tiktok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : platform === 'youtube'
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : null;
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title as string | undefined,
      author: data.author_name as string | undefined,
      image: data.thumbnail_url as string | undefined,
    };
  } catch {
    return null;
  }
}

function parseMeta(html: string, baseUrl: string): Omit<Preview, 'resolvedUrl'> {
  const head = html.slice(0, 300_000);
  const meta = (names: string[]) => {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
        'i',
      );
      const m = head.match(re);
      const value = m?.[1] ?? m?.[2];
      if (value?.trim()) return decodeEntities(value.trim());
    }
    return undefined;
  };
  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const image = meta(['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
  return {
    title: meta(['og:title', 'twitter:title']) ?? (titleTag ? decodeEntities(titleTag.trim()) : undefined),
    description: meta(['og:description', 'twitter:description', 'description']),
    author: meta(['author', 'article:author', 'og:site_name']),
    image: image ? new URL(image, baseUrl).toString() : undefined,
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function readLimited(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(all.subarray(0, Math.min(size, limit)));
}

// ---------- thumbnail ----------

/** Platform image URLs are signed and expire, so keep our own copy. Returns the storage path. */
async function storeThumbnail(
  db: SupabaseClient,
  imageUrl: string,
  pathBase: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(10_000),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `${pathBase}.${ext}`;
    const { error } = await db.storage
      .from('thumbnails')
      .upload(path, bytes, { contentType: type, upsert: true });
    if (error) throw error;
    return path;
  } catch (e) {
    console.warn('thumbnail failed', imageUrl, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------- AI ----------

async function userLabels(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('links').select('labels').limit(1000);
  const counts = new Map<string, number>();
  for (const row of data ?? []) for (const l of row.labels ?? []) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150).map(([l]) => l);
}

const Description = z.object({
  title: z.string().describe('Short, clean title for the post (keep the original language), max 80 chars'),
  description: z.string().describe('One or two sentence English summary, max 160 chars'),
  labels: z.array(z.string()).describe('1 to 4 lowercase English topic labels'),
});

async function describe(input: {
  platform: string;
  url: string;
  title?: string;
  description?: string;
  author?: string;
  sharedText?: string | null;
  existingLabels: string[];
}): Promise<z.infer<typeof Description> | null> {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return null;
  const known = [input.title, input.description, input.sharedText].filter(Boolean).join('\n');
  if (!known) return null;

  const client = new Anthropic();
  const prompt = [
    `Platform: ${PLATFORM_NAMES[input.platform as Platform] ?? input.platform}`,
    `URL: ${input.url}`,
    input.author && `Author: ${input.author}`,
    input.title && `Page title: ${input.title}`,
    input.description && `Page description: ${input.description}`,
    input.sharedText && `Text shared with the link: ${input.sharedText}`,
    '',
    `Labels already in use (reuse one when it fits, otherwise create a new one): ${
      input.existingLabels.join(', ') || '(none yet)'
    }`,
  ]
    .filter((l): l is string => typeof l === 'string')
    .join('\n');

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Description) },
      system:
        'You organize a personal collection of saved social media posts and web links. ' +
        'Given what is known about one saved post, write a clean title, a short English summary, ' +
        'and 1-4 topic labels. Labels are lowercase English, one or two words, about the subject ' +
        '(e.g. "ai", "recipes", "travel japan", "fitness"), never the platform name. ' +
        'Ignore boilerplate like "copy this link and open the app".',
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const out = response.parsed_output;
    return {
      title: out.title.trim().slice(0, 120),
      description: out.description.trim().slice(0, 240),
      labels: [...new Set(out.labels.map(cleanLabel).filter(Boolean))].slice(0, 4),
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error('claude error', e.status, e.message);
    else console.error('claude error', e);
    return null;
  }
}

function cleanLabel(l: string) {
  return l.toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N} &+-]/gu, '').trim().slice(0, 30);
}

function truncate(s: string | undefined, n: number) {
  if (!s) return undefined;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
