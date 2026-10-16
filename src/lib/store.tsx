import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  detectPlatform,
  extractUrl,
  normalizeUrl,
  textWithoutUrl,
} from '../../supabase/functions/_shared/url';
import { supabase } from './supabase';
import type { Folder, Link, LinkPatch } from './types';

export type SaveResult = { link: Link; duplicate: boolean };

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const enriching = useRef(new Set<string>());

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
        await supabase.functions.invoke('enrich', { body: { link_id: id } });
      } finally {
        enriching.current.delete(id);
        // Re-read the row whatever happened: the function records failures on the row itself.
        const { data } = await supabase.from('links').select('*').eq('id', id).maybeSingle();
        if (data) upsertLocal(data as Link);
      }
    },
    [upsertLocal],
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

  // INITIAL_SESSION fires on subscribe, so this also covers app start.
  const userId = useRef<string | null>(null);
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
      if (id) setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const saveFromText = useCallback(
    async (text: string, folderId: string | null = null): Promise<SaveResult> => {
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

  const updateLink = useCallback(
    async (id: string, patch: LinkPatch) => {
      const { data, error } = await supabase.from('links').update(patch).eq('id', id).select().single();
      if (error) throw error;
      upsertLocal(data as Link);
    },
    [upsertLocal],
  );

  const deleteLink = useCallback(async (id: string) => {
    const { error } = await supabase.from('links').delete().eq('id', id);
    if (error) throw error;
    setLinks((prev) => prev.filter((l) => l.id !== id));
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
    const { error } = await supabase.from('links').delete().in('id', ids);
    if (error) throw error;
    const set = new Set(ids);
    setLinks((prev) => prev.filter((l) => !set.has(l.id)));
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
      createFolder,
      renameFolder,
      deleteFolder,
      moveLinks,
      deleteLinks,
      shareFolder,
      unshareFolder,
    }),
    [session, authReady, links, folders, loading, refresh, saveFromText, updateLink, deleteLink, enrich, createFolder, renameFolder, deleteFolder, moveLinks, deleteLinks, shareFolder, unshareFolder],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}
