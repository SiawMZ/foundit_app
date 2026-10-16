import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PLATFORM_NAMES, type Platform } from '../../supabase/functions/_shared/url';
import { LinkCard } from '@/components/link-card';
import { Button, Chip, Field } from '@/components/ui';
import { applyFilter, EMPTY_FILTER, labelCounts, SORT_LABELS, type LinkFilter, type SortKey } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { font, space, useColors } from '@/lib/theme';

const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const MAX_WIDTH = 1200;

export default function Home() {
  const c = useColors();
  const { links, folders, loading, refresh } = useStore();
  const [filter, setFilter] = useState<LinkFilter>(EMPTY_FILTER);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_WIDTH);
  const columns = Math.max(2, Math.floor(contentWidth / 240));

  const visible = useMemo(() => applyFilter(links, filter), [links, filter]);
  const platforms = useMemo(
    () => [...new Set(links.map((l) => l.platform))].sort() as Platform[],
    [links],
  );
  const labels = useMemo(() => labelCounts(links).slice(0, 30), [links]);
  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const set = (patch: Partial<LinkFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const filtered =
    filter.query || filter.platform || filter.folder !== undefined || filter.label;

  const header = (
    <View style={styles.filters}>
      <Field
        placeholder="Search titles, notes, labels…"
        value={filter.query}
        onChangeText={(query) => set({ query })}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      <Row>
        <Chip
          label={`Sort: ${SORT_LABELS[filter.sort]}`}
          active
          onPress={() => set({ sort: SORTS[(SORTS.indexOf(filter.sort) + 1) % SORTS.length] })}
        />
        {platforms.map((p) => (
          <Chip
            key={p}
            label={PLATFORM_NAMES[p]}
            active={filter.platform === p}
            onPress={() => set({ platform: filter.platform === p ? null : p })}
          />
        ))}
      </Row>
      {folders.length ? (
        <Row>
          <Chip label="All folders" active={filter.folder === undefined} onPress={() => set({ folder: undefined })} />
          <Chip label="Unfiled" active={filter.folder === null} onPress={() => set({ folder: null })} />
          {folders.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              active={filter.folder === f.id}
              onPress={() => set({ folder: filter.folder === f.id ? undefined : f.id })}
            />
          ))}
        </Row>
      ) : null}
      {labels.length ? (
        <Row>
          {labels.map(([l]) => (
            <Chip
              key={l}
              label={`# ${l}`}
              active={filter.label === l}
              onPress={() => set({ label: filter.label === l ? null : l })}
            />
          ))}
        </Row>
      ) : null}
      <View style={styles.countRow}>
        <Text style={[styles.count, { color: c.muted }]}>
          {visible.length} {visible.length === 1 ? 'link' : 'links'}
        </Text>
        {filtered ? (
          <Pressable onPress={() => setFilter({ ...EMPTY_FILTER, sort: filter.sort })} hitSlop={8}>
            <Text style={[styles.count, { color: c.text, textDecorationLine: 'underline' }]}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton label="Folders" onPress={() => router.push('/folders')} />
              <HeaderButton label="+ Add" onPress={() => router.push('/add')} strong />
            </View>
          ),
        }}
      />
      <FlatList
        key={columns}
        data={visible}
        numColumns={columns}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns, padding: space.xs }}>
            <LinkCard link={item} folderName={item.folder_id ? folderNames.get(item.folder_id) : undefined} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? undefined : (
            <Empty
              title={links.length ? 'Nothing matches' : 'No links yet'}
              body={
                links.length
                  ? 'Try a different search or clear the filters.'
                  : 'Share a post from Instagram, TikTok, Xiaohongshu or any app and pick Linkbox — or paste a link here.'
              }
              action={links.length ? undefined : () => router.push('/add')}
            />
          )
        }
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={[styles.list, { width: contentWidth }]}
        style={{ backgroundColor: c.bg }}
      />
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

function HeaderButton({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.headerButton}>
      <Text style={{ color: c.text, fontSize: font.md, fontWeight: strong ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.muted }]}>{body}</Text>
      {action ? <Button label="Add a link" onPress={action} style={{ marginTop: space.md }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: 'center', padding: space.md, paddingBottom: space.xxl },
  filters: { gap: space.md, paddingHorizontal: space.xs, paddingBottom: space.md },
  row: { gap: space.sm },
  countRow: { flexDirection: 'row', justifyContent: 'space-between' },
  count: { fontSize: font.sm },
  headerActions: { flexDirection: 'row', gap: space.lg, paddingRight: space.sm },
  headerButton: { paddingVertical: space.xs },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: '600' },
  emptyBody: { fontSize: font.md, textAlign: 'center', maxWidth: 360, lineHeight: 22 },
});
