import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  detectPlatform,
  extractUrl,
  normalizeUrl,
  textWithoutUrl,
} from '../../supabase/functions/_shared/url';
import type { FoundLink } from './import';
import { isNetworkError, loadQueue, persistQueue, queueId, type QueuedSave } from './offline';
import { supabase } from './supabase';
import type { Folder, Link, LinkPatch } from './types';

/** `queued`: no connection — kept on the device and saved automatically later. */
export type SaveResult =
  | { link: Link; duplicate: boolean; queued: false }
  | { link: null; duplicate: false; queued: true };

export type ImportProgress = { done: number; total: number };

type Store = {
  session: Session | null;
  authReady: boolean;
  links: Link[];
  folders: Folder[];
  loading: boolean;
  refresh: () => Promise<void>;
  saveFromText: (text: string, folderId?: string | null) => Promise<SaveResult>;
  updateLink: (id: string, patch: LinkPatch) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
  moveLinks: (ids: string[], folderId: string | null) => Promise<void>;
  deleteLinks: (ids: string[]) => Promise<void>;
  enrich: (id: string) => Promise<void>;
  /** Saves waiting for a connection (this account only). */
  queued: QueuedSave[];
  retryQueued: () => Promise<void>;
  /** Saves many links at once (data-export import). Returns how many were new. */
  importLinks: (found: FoundLink[], folderId: string | null, onProgress?: (p: ImportProgress) => void) => Promise<number>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  /** Returns the folder's share token, creating one if needed. */
  shareFolder: (id: string) => Promise<string>;
  unshareFolder: (id: string) => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const store = use(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/** Pending links older than this were probably interrupted (app closed mid-save) — retry them. */
const STALE_PENDING_MS = 2 * 60 * 1000;
/** Previews fetched at the same time; keeps a big import from flooding the enrich function. */
const ENRICH_CONCURRENCY = 3;
const RETRY_QUEUE_MS = 30 * 1000;
const IMPORT_BATCH = 100;

/** Runs at most `max` async jobs at once, in order. */
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const run = waiting.shift();
    if (!run) return;
    active++;
    run();
  };
  return <T,>(job: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        job()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

/**
 * Thumbnails are public by URL, so they go when their link goes. Best effort: a leftover file is
 * harmless and is removed with the account.
 */
async function removeThumbnails(rows: { thumbnail_path: string | null }[] | null) {
  const paths = (rows ?? []).map((r) => r.thumbnail_path).filter((p): p is string => !!p);
  if (!paths.length) return;
  const { error } = await supabase.storage.from('thumbnails').remove(paths);
  if (error) console.warn('thumbnail cleanup failed', error.message);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const enriching = useRef(new Set<string>());
  const limit = useRef(createLimiter(ENRICH_CONCURRENCY)).current;
  const [allQueued, setAllQueued] = useState<QueuedSave[]>([]);
  const queueRef = useRef<QueuedSave[]>([]);
  const flushing = useRef(false);

  const setQueue = useCallback((next: QueuedSave[]) => {
    queueRef.current = next;
    setAllQueued(next);
    void persistQueue(next);
  }, []);

  useEffect(() => {
    void loadQueue().then((q) => {
      queueRef.current = q;
      setAllQueued(q);
    });
  }, []);

  const upsertLocal = useCallback((link: Link) => {
    setLinks((prev) => {
      const i = prev.findIndex((l) => l.id === link.id);
      if (i === -1) return [link, ...prev];
      const next = prev.slice();
      next[i] = link;
      return next;
    });
  }, []);

  const enrich = useCallback(
    async (id: string) => {
      if (enriching.current.has(id)) return;
      enriching.current.add(id);
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'pending' } : l)));
      try {
        await limit(() => supabase.functions.invoke('enrich', { body: { link_id: id } }));
      } finally {
        enriching.current.delete(id);
        // Re-read the row whatever happened: the function records failures on the row itself.
        const { data } = await supabase.from('links').select('*').eq('id', id).maybeSingle();
        if (data) upsertLocal(data as Link);
      }
    },
    [limit, upsertLocal],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, f] = await Promise.all([
        supabase.from('links').select('*').order('created_at', { ascending: false }),
        supabase.from('folders').select('*').order('name'),
      ]);
      if (l.error) throw l.error;
      if (f.error) throw f.error;
      const rows = l.data as Link[];
      setLinks(rows);
      setFolders(f.data as Folder[]);
      const now = Date.now();
      for (const row of rows) {
        if (row.status === 'pending' && now - Date.parse(row.created_at) > STALE_PENDING_MS) {
          void enrich(row.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [enrich]);

  /** One save attempt against the server. Throws on failure (network or otherwise). */
  const insertLink = useCallback(
    async (text: string, folderId: string | null): Promise<{ link: Link; duplicate: boolean }> => {
      const url = extractUrl(text.trim());
      if (!url) throw new Error('No link found in that text.');
      const normalized = normalizeUrl(url);
      const extra = textWithoutUrl(text, url);

      const { data, error } = await supabase
        .from('links')
        .insert({
          url,
          normalized_url: normalized,
          platform: detectPlatform(url),
          shared_text: extra || null,
          folder_id: folderId,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const existing = await supabase
            .from('links')
            .select('*')
            .eq('normalized_url', normalized)
            .single();
          if (existing.data) {
            upsertLocal(existing.data as Link);
            return { link: existing.data as Link, duplicate: true };
          }
        }
        throw error;
      }
      const link = data as Link;
      upsertLocal(link);
      void enrich(link.id);
      return { link, duplicate: false };
    },
    [enrich, upsertLocal],
  );

  const userId = useRef<string | null>(null);

  const saveFromText = useCallback(
    async (text: string, folderId: string | null = null): Promise<SaveResult> => {
      if (!extractUrl(text.trim())) throw new Error('No link found in that text.');
      try {
        return { ...(await insertLink(text, folderId)), queued: false };
      } catch (e) {
        if (!isNetworkError(e) || !userId.current) throw e;
        const item: QueuedSave = {
          id: queueId(),
          userId: userId.current,
          text,
          folderId,
          queuedAt: new Date().toISOString(),
        };
        setQueue([...queueRef.current, item]);
        return { link: null, duplicate: false, queued: true };
      }
    },
    [insertLink, setQueue],
  );

  /** Saves queued items in order; stops at the first network failure and tries again later. */
  const retryQueued = useCallback(async () => {
    const me = userId.current;
    if (flushing.current || !me) return;
    flushing.current = true;
    try {
      for (const item of queueRef.current.filter((q) => q.userId === me)) {
        try {
          await insertLink(item.text, item.folderId);
        } catch (e) {
          if (isNetworkError(e)) return;
          // Anything else (e.g. the folder was deleted) won't succeed on retry; drop it.
          console.warn('dropping queued save', e);
        }
        setQueue(queueRef.current.filter((q) => q.id !== item.id));
      }
    } finally {
      flushing.current = false;
    }
  }, [insertLink, setQueue]);

  const sessionUserId = session?.user.id;
  const queued = useMemo(() => allQueued.filter((q) => q.userId === sessionUserId), [allQueued, sessionUserId]);

  // Retry when the app returns to the foreground, when the browser goes online, and every 30s.
  useEffect(() => {
    if (!queued.length) return;
    const timer = setInterval(() => void retryQueued(), RETRY_QUEUE_MS);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retryQueued();
    });
    const online = () => void retryQueued();
    if (Platform.OS === 'web') window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      app.remove();
      if (Platform.OS === 'web') window.removeEventListener('online', online);
    };
  }, [queued.length, retryQueued]);

  const importLinks = useCallback(
    async (found: FoundLink[], folderId: string | null, onProgress?: (p: ImportProgress) => void) => {
      const rows = found.map((f) => ({
        url: f.url,
        normalized_url: f.normalized,
        platform: f.platform,
        folder_id: folderId,
      }));
      const inserted: Link[] = [];
      for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
        // Already-saved posts are skipped by the (user_id, normalized_url) unique key.
        const { data, error } = await supabase
          .from('links')
          .upsert(rows.slice(i, i + IMPORT_BATCH), { onConflict: 'user_id,normalized_url', ignoreDuplicates: true })
          .select();
        if (error) throw error;
        inserted.push(...((data ?? []) as Link[]));
        onProgress?.({ done: Math.min(i + IMPORT_BATCH, rows.length), total: rows.length });
      }
      setLinks((prev) => [...inserted, ...prev]);
      for (const link of inserted) void enrich(link.id);
      return inserted.length;
    },
    [enrich],
  );

  // INITIAL_SESSION fires on subscribe, so this also covers app start.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
      const id = s?.user.id ?? null;
      if (id === userId.current) return; // token refresh, same user
      userId.current = id;
      setLinks([]);
      setFolders([]);
      // Supabase calls inside this callback can deadlock the auth lock, so defer.
      if (id) setTimeout(() => void refresh().then(retryQueued, () => {}), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh, retryQueued]);

  const updateLink = useCallback(
    async (id: string, patch: LinkPatch) => {
      const { data, error } = await supabase.from('links').update(patch).eq('id', id).select().single();
      if (error) throw error;
      upsertLocal(data as Link);
    },
    [upsertLocal],
  );

  const deleteLink = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('links').delete().eq('id', id).select('thumbnail_path');
    if (error) throw error;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    void removeThumbnails(data);
  }, []);

  const moveLinks = useCallback(async (ids: string[], folderId: string | null) => {
    if (!ids.length) return;
    const { error } = await supabase.from('links').update({ folder_id: folderId }).in('id', ids);
    if (error) throw error;
    const set = new Set(ids);
    setLinks((prev) => prev.map((l) => (set.has(l.id) ? { ...l, folder_id: folderId } : l)));
  }, []);

  const deleteLinks = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data, error } = await supabase.from('links').delete().in('id', ids).select('thumbnail_path');
    if (error) throw error;
    const set = new Set(ids);
    setLinks((prev) => prev.filter((l) => !set.has(l.id)));
    void removeThumbnails(data);
  }, []);

  const shareFolder = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('share_folder', { p_folder: id });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('Could not create a share link.');
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, share_token: data } : f)));
    return data;
  }, []);

  const unshareFolder = useCallback(async (id: string) => {
    const { error } = await supabase.from('folders').update({ share_token: null }).eq('id', id);
    if (error) throw error;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, share_token: null } : f)));
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('folders').insert({ name: name.trim() }).select().single();
    if (error) throw error.code === '23505' ? new Error('A folder with that name already exists.') : error;
    setFolders((prev) => [...prev, data as Folder].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Folder;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', id);
    if (error) throw error.code === '23505' ? new Error('A folder with that name already exists.') : error;
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    const { error } = await supabase.from('folders').delete().eq('id', id);
    if (error) throw error;
    setFolders((prev) => prev.filter((f) => f.id !== id));
    // Links in it become unfiled (on delete set null).
    setLinks((prev) => prev.map((l) => (l.folder_id === id ? { ...l, folder_id: null } : l)));
  }, []);

  const value = useMemo<Store>(
    () => ({
      session,
      authReady,
      links,
      folders,
      loading,
      refresh,
      saveFromText,
      updateLink,
      deleteLink,
      enrich,
      queued,
      retryQueued,
      importLinks,
      createFolder,
      renameFolder,
      deleteFolder,
      moveLinks,
      deleteLinks,
      shareFolder,
      unshareFolder,
    }),
    [session, authReady, links, folders, loading, refresh, saveFromText, updateLink, deleteLink, enrich, queued, retryQueued, importLinks, createFolder, renameFolder, deleteFolder, moveLinks, deleteLinks, shareFolder, unshareFolder],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}
