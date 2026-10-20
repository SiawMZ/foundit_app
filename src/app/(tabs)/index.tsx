import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLATFORM_NAMES, type Platform } from '../../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { LinkCard } from '@/components/link-card';
import { Button, Chip, Field, Rule, ScreenHeader, Sheet, T } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { askSearch } from '@/lib/ask';
import { takePendingJoin } from '@/lib/join';
import { applyFilter, mergeLibrary, rankByTerms, SORT_LABELS, type AskTerms, type SortKey } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { pad2, space, useColors, useIsWide } from '@/lib/theme';

const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const MAX_WIDTH = 1280;

export default function Links() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const { width } = useWindowDimensions();
  const { links, joinedLinks, folders, loading, refresh, moveLinks, deleteLinks, queued, retryQueued } = useStore();

  // Folder and label filters live in the URL so the sidebar, Folders tab and Tags tab can set them.
  const params = useLocalSearchParams<{ folder?: string; label?: string }>();
  const folderParam = params.folder || undefined;
  const label = params.label || null;
  const folder = folderParam === 'none' ? null : folderParam;

  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [moving, setMoving] = useState(false);
  // AI search: runs only when the question is submitted, never per keystroke.
  const [ai, setAi] = useState(false);
  const [asked, setAsked] = useState<AskTerms | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const selecting = selected !== null;
  const list = useRef<FlatList>(null);

  // Signed in from an invite page (sign-in always lands here): go back to the invite.
  useEffect(() => {
    const token = takePendingJoin();
    if (token) router.push({ pathname: '/join/[token]', params: { token } });
  }, []);

  // Opening a folder or tag from another tab should start at the top of the list.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [folderParam, label]);

  const contentWidth = Math.min(width - (wide ? 260 : 0), MAX_WIDTH);
  const columns = Math.max(2, Math.floor((contentWidth - space.xl * 2) / 230));

  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  // A folder shows every copy in it (mine and other members'); everywhere else one card per post.
  const library = useMemo(
    () =>
      typeof folder === 'string' ? [...links, ...joinedLinks] : folder === null ? links : mergeLibrary(links, joinedLinks, folderNames),
    [links, joinedLinks, folder, folderNames],
  );
  const mine = useMemo(() => new Set(links.map((l) => l.id)), [links]);

  const visible = useMemo(() => {
    if (!ai) return applyFilter(library, { query, platform, folder, label, sort });
    // In AI mode the typed question is not a filter; only the returned terms are.
    const base = applyFilter(library, { query: '', platform, folder, label, sort });
    return asked ? rankByTerms(base, asked) : base;
  }, [library, query, platform, folder, label, sort, ai, asked]);
  const visibleMine = useMemo(() => visible.filter((l) => mine.has(l.id)), [visible, mine]);
  const platforms = useMemo(() => [...new Set(library.map((l) => l.platform))].sort() as Platform[], [library]);

  const title = folder ? (folderNames.get(folder) ?? 'Folder') : folder === null ? 'Unfiled' : label ? `#${label}` : 'All links';

  const toggle = useCallback((id: string) => {
    if (!mine.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [mine]);
  const startSelect = useCallback((id: string) => setSelected(mine.has(id) ? new Set([id]) : new Set()), [mine]);

  function toggleAi() {
    setAi(!ai);
    setAsked(null);
    setAskError(null);
  }

  function changeQuery(text: string) {
    setQuery(text);
    if (!text.trim()) {
      setAsked(null);
      setAskError(null);
    }
  }

  async function ask() {
    const question = query.trim();
    if (!ai || asking || question.length < 3) return;
    setAsking(true);
    setAskError(null);
    try {
      setAsked(await askSearch(question));
    } catch (e) {
      setAsked(null);
      setAskError(e instanceof Error ? e.message : 'AI search failed. Try again.');
    } finally {
      setAsking(false);
    }
  }

  const askedTerms = asked ? [...asked.keywords, ...asked.labels.map((l) => `#${l}`)] : [];

  async function removeSelected() {
    const ids = [...(selected ?? [])];
    if (!ids.length) return;
    const ok = await confirm(
      `Delete ${ids.length} link${ids.length === 1 ? '' : 's'}?`,
      'They are removed from Linkbox only, not from the original apps.',
    );
    if (!ok) return;
    await deleteLinks(ids);
    setSelected(null);
  }

  async function moveSelected(folderId: string | null) {
    await moveLinks([...(selected ?? [])], folderId);
    setMoving(false);
    setSelected(null);
  }

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        title={title}
        meta={`${pad2(1)}  Links · ${visible.length}`}
        actions={
          selecting ? (
            <Button size="sm" variant="secondary" label="Cancel" onPress={() => setSelected(null)} />
          ) : (
            <>
              <Button size="sm" variant="secondary" label="Select" onPress={() => setSelected(new Set())} />
              {!wide ? <Button size="sm" label="+ Add" onPress={() => router.push('/add')} /> : null}
            </>
          )
        }
      />

      {queued.length ? (
        <View style={[styles.queueBar, { borderColor: c.line }]}>
          <T variant="small" style={{ flex: 1 }}>
            {queued.length} {queued.length === 1 ? 'link' : 'links'} saved offline — waiting for a connection.
          </T>
          <Button size="sm" variant="secondary" label="Retry" onPress={() => void retryQueued()} />
        </View>
      ) : null}

      {folderParam || label ? (
        <View style={styles.row}>
          <T variant="label" tone="muted">Filtered by</T>
          {folderParam ? (
            <Chip label={`${folder === null ? 'Unfiled' : (folderNames.get(folder!) ?? 'Folder')}  ×`} active onPress={() => router.setParams({ folder: '' })} />
          ) : null}
          {label ? <Chip label={`#${label}  ×`} active onPress={() => router.setParams({ label: '' })} /> : null}
        </View>
      ) : null}

      <Field
        placeholder={ai ? 'Ask, e.g. that matcha cafe in KK' : 'Search titles, notes, labels…'}
        value={query}
        onChangeText={changeQuery}
        onSubmitEditing={() => void ask()}
        returnKeyType={ai ? 'search' : 'done'}
        maxLength={ai ? 200 : undefined}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel={ai ? 'Ask AI to find saved posts' : 'Search links'}
        right={
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="AI search"
            accessibilityState={{ checked: ai }}
            onPress={toggleAi}
            hitSlop={8}
            style={({ pressed }) => [styles.aiToggle, { opacity: pressed ? 0.6 : 1 }]}>
            {asking ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <T variant="label" tone={ai ? 'accent' : 'muted'}>
                AI
              </T>
            )}
          </Pressable>
        }
      />
      {ai ? (
        <T variant="small" tone={askError ? 'danger' : 'muted'}>
          {askError ??
            (asking
              ? 'Finding search terms…'
              : asked
                ? askedTerms.length
                  ? `Searched for: ${askedTerms.join(' · ')}`
                  : 'That didn’t look like a search. Describe the post you’re looking for.'
                : 'Describe a post in your own words and press Enter. AI picks the search terms; only your links are searched.')}
        </T>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label={`Sort: ${SORT_LABELS[sort]}`} onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Chip label="All" active={!platform} onPress={() => setPlatform(null)} />
        {platforms.map((p) => (
          <Chip key={p} label={PLATFORM_NAMES[p]} active={platform === p} onPress={() => setPlatform(platform === p ? null : p)} />
        ))}
      </ScrollView>
      {selecting ? (
        <T variant="small" tone="muted">
          Tap cards to select them.{joinedLinks.length ? ' Links other people added can’t be selected.' : ''}
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <FlatList
        ref={list}
        key={columns}
        data={visible}
        numColumns={columns}
        keyExtractor={(l) => l.id}
        columnWrapperStyle={{ gap: space.lg }}
        renderItem={({ item }) => {
          const own = mine.has(item.id);
          const inFolders = item.inFolders?.length ?? 0;
          return (
            // Other members' links can't be selected (bulk actions only touch my own links).
            <View
              style={{ flex: 1 / columns, maxWidth: `${100 / columns}%`, opacity: selecting && !own ? 0.35 : 1 }}
              pointerEvents={selecting && !own ? 'none' : 'auto'}>
              <LinkCard
                link={item}
                folderName={
                  inFolders > 1 ? `In ${inFolders} folders` : item.folder_id && !folder ? folderNames.get(item.folder_id) : undefined
                }
                addedBy={item.added_by}
                selecting={selecting && own}
                selected={selected?.has(item.id)}
                onToggleSelect={toggle}
                onStartSelect={own ? startSelect : undefined}
              />
            </View>
          );
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={styles.empty}>
              <T variant="title">{links.length ? 'Nothing matches.' : 'No links yet.'}</T>
              <T tone="muted" style={{ maxWidth: 380 }}>
                {links.length
                  ? 'Try a different search or clear the filters.'
                  : 'Share a post from Instagram, TikTok, Xiaohongshu or any app and pick Linkbox — or paste a link.'}
              </T>
              {!links.length ? <Button label="+ Add a link" onPress={() => router.push('/add')} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={[
          styles.list,
          { width: contentWidth, paddingTop: insets.top + space.xl, paddingBottom: selecting ? 120 : space.xxxl },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: space.xl }} />}
      />

      {selecting ? (
        <View style={[styles.bulkBar, { backgroundColor: c.bg, borderTopColor: c.line }]}>
          <View style={{ flex: 1 }}>
            <T variant="title">{pad2(selected.size)}</T>
            <T variant="label" tone="muted">Selected</T>
          </View>
          <Button
            size="sm"
            variant="ghost"
            label={selected.size === visibleMine.length ? 'None' : 'All'}
            onPress={() =>
              setSelected(selected.size === visibleMine.length ? new Set() : new Set(visibleMine.map((l) => l.id)))
            }
          />
          <Button size="sm" variant="danger" label="Delete" disabled={!selected.size} onPress={removeSelected} />
          <Button size="sm" label="Move to folder" disabled={!selected.size} onPress={() => setMoving(true)} />
        </View>
      ) : null}

      <Sheet visible={moving} onClose={() => setMoving(false)} title={`Move ${selected?.size ?? 0} to…`}>
        <FolderPicker value={undefined} onChange={moveSelected} />
        <Rule />
        <T variant="small" tone="muted">
          Pick a folder, or create a new one. Each link lives in one folder.
        </T>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { alignSelf: 'center', paddingHorizontal: space.xl },
  headerBlock: { gap: space.lg, paddingBottom: space.xl },
  queueBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 2, padding: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  aiToggle: { height: 32, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, height: 20, marginHorizontal: space.xs },
  empty: { paddingVertical: space.xxxl, gap: space.md },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
});
