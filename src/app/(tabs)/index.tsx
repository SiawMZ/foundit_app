import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLATFORM_NAMES, type Platform } from '../../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { LinkCard } from '@/components/link-card';
import { Button, Chip, Field, Rule, ScreenHeader, Sheet, T } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { applyFilter, SORT_LABELS, type SortKey } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { pad2, space, useColors, useIsWide } from '@/lib/theme';

const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const MAX_WIDTH = 1280;

export default function Links() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const { width } = useWindowDimensions();
  const { links, folders, loading, refresh, moveLinks, deleteLinks } = useStore();

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
  const selecting = selected !== null;
  const list = useRef<FlatList>(null);

  // Opening a folder or tag from another tab should start at the top of the list.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [folderParam, label]);

  const contentWidth = Math.min(width - (wide ? 260 : 0), MAX_WIDTH);
  const columns = Math.max(2, Math.floor((contentWidth - space.xl * 2) / 230));

  const visible = useMemo(
    () => applyFilter(links, { query, platform, folder, label, sort }),
    [links, query, platform, folder, label, sort],
  );
  const platforms = useMemo(() => [...new Set(links.map((l) => l.platform))].sort() as Platform[], [links]);
  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const title = folder ? (folderNames.get(folder) ?? 'Folder') : folder === null ? 'Unfiled' : label ? `#${label}` : 'All links';

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const startSelect = useCallback((id: string) => setSelected(new Set([id])), []);

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
        placeholder="Search titles, notes, labels…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
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
          Tap cards to select them.
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
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns, maxWidth: `${100 / columns}%` }}>
            <LinkCard
              link={item}
              folderName={item.folder_id && !folder ? folderNames.get(item.folder_id) : undefined}
              selecting={selecting}
              selected={selected?.has(item.id)}
              onToggleSelect={toggle}
              onStartSelect={startSelect}
            />
          </View>
        )}
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
            label={selected.size === visible.length ? 'None' : 'All'}
            onPress={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((l) => l.id)))}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
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
