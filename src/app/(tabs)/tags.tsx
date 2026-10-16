import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, ScreenHeader, T } from '@/components/ui';
import { labelCounts } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { fonts, pad2, space, useColors } from '@/lib/theme';

const MIN_SIZE = 15;
const MAX_SIZE = 34;

/**
 * Every tag in one pool, sized by how often it's used. Typing lights up the matching tags
 * in red and fades the rest; tapping a tag shows its links.
 */
export default function Tags() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { links } = useStore();
  const [query, setQuery] = useState('');

  const tags = useMemo(() => labelCounts(links), [links]);
  const max = tags[0]?.[1] ?? 1;
  const q = query.trim().toLowerCase().replace(/^#/, '');
  const matches = q ? tags.filter(([t]) => t.includes(q)).length : tags.length;

  // Alphabetical reads better in a pool; size carries the frequency.
  const pool = useMemo(() => [...tags].sort((a, b) => a[0].localeCompare(b[0])), [tags]);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space.xl }]}
      keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Tags" meta={`${pad2(3)}  Tags · ${tags.length}`} />
      <Field placeholder="Search tags…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      <T variant="label" tone="muted">
        {q ? `${matches} matching “${q}”` : 'Bigger = used more. Tap a tag to see its links.'}
      </T>

      {pool.length ? (
        <View style={styles.pool}>
          {pool.map(([tag, count]) => {
            const hit = !q || tag.includes(q);
            const size = MIN_SIZE + Math.round(((MAX_SIZE - MIN_SIZE) * Math.sqrt(count)) / Math.sqrt(max));
            return (
              <Pressable
                key={tag}
                onPress={() => router.navigate({ pathname: '/', params: { label: tag, folder: '' } })}
                accessibilityRole="link"
                accessibilityLabel={`${tag}, ${count} links`}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.tag,
                  { opacity: hit ? 1 : 0.15 },
                  hovered && { backgroundColor: c.surface },
                ]}>
                <T
                  style={{
                    fontFamily: count / max > 0.5 ? fonts.black : fonts.bold,
                    fontSize: size,
                    lineHeight: size * 1.1,
                    letterSpacing: -size / 40,
                    color: q && hit ? c.accent : c.text,
                  }}>
                  {tag}
                </T>
                <T variant="number" tone={q && hit ? 'accent' : 'muted'} style={styles.count}>
                  {count}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <T tone="muted">No tags yet. They’re added automatically when you save links, or by hand on a link’s details.</T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  pool: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.lg, rowGap: space.sm, paddingTop: space.md },
  tag: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, paddingVertical: 2 },
  count: { marginTop: 2 },
});
