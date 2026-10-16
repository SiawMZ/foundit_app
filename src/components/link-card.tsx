import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PLATFORM_NAMES } from '../../supabase/functions/_shared/url';
import { displayTitle } from '@/lib/filter';
import { openLink, thumbnailUrl } from '@/lib/open';
import { font, radius, space, useColors } from '@/lib/theme';
import type { Link } from '@/lib/types';

export const LinkCard = memo(function LinkCard({ link, folderName }: { link: Link; folderName?: string }) {
  const c = useColors();
  const showDetail = () => router.push({ pathname: '/link/[id]', params: { id: link.id } });

  return (
    <Pressable
      onPress={() => openLink(link)}
      onLongPress={showDetail}
      accessibilityRole="link"
      accessibilityHint="Opens the post. Long press for details."
      style={({ pressed }) => [styles.card, { borderColor: c.border, backgroundColor: c.bg, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.thumb, { backgroundColor: c.surface }]}>
        {thumbnailUrl(link) ? (
          <Image source={thumbnailUrl(link)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Text style={[styles.placeholder, { color: c.muted }]}>{PLATFORM_NAMES[link.platform]}</Text>
        )}
        {link.status === 'pending' ? (
          <View style={[styles.badge, { backgroundColor: c.bg }]}>
            <ActivityIndicator size="small" color={c.muted} />
          </View>
        ) : null}
        {link.pinned ? (
          <View style={[styles.pin, { backgroundColor: c.accent }]}>
            <Text style={{ color: c.inverse, fontSize: font.xs, fontWeight: '700' }}>PINNED</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
            {PLATFORM_NAMES[link.platform]}
            {folderName ? ` · ${folderName}` : ''}
          </Text>
          <Pressable
            onPress={showDetail}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Link details">
            <Text style={[styles.more, { color: c.muted }]}>•••</Text>
          </Pressable>
        </View>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {displayTitle(link)}
        </Text>
        {link.description ? (
          <Text style={[styles.desc, { color: c.muted }]} numberOfLines={2}>
            {link.description}
          </Text>
        ) : null}
        {link.labels.length ? (
          <View style={styles.labels}>
            {link.labels.slice(0, 3).map((l) => (
              <Text key={l} style={[styles.label, { color: c.text, borderColor: c.border }]} numberOfLines={1}>
                {l}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  thumb: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { fontSize: font.md, fontWeight: '600', letterSpacing: 0.5 },
  badge: { position: 'absolute', top: space.sm, right: space.sm, borderRadius: radius.pill, padding: space.xs },
  pin: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  body: { padding: space.md, gap: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  meta: { flex: 1, fontSize: font.xs, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  more: { fontSize: font.sm, letterSpacing: 1 },
  title: { fontSize: font.md, fontWeight: '600', lineHeight: 20 },
  desc: { fontSize: font.sm, lineHeight: 18 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  label: {
    fontSize: font.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    maxWidth: '100%',
  },
});
