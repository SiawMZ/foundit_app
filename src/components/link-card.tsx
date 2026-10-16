import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PLATFORM_NAMES, type Platform } from '../../supabase/functions/_shared/url';
import { Check, T } from '@/components/ui';
import { openLink, thumbnailUrl } from '@/lib/open';
import { fonts, space, useColors } from '@/lib/theme';

type CardLink = {
  id: string;
  url: string;
  resolved_url?: string | null;
  platform: Platform;
  title: string | null;
  description: string | null;
  shared_text: string | null;
  thumbnail_path: string | null;
  labels: string[];
  pinned?: boolean;
  status?: 'pending' | 'ready' | 'failed';
  updated_at?: string;
  created_at: string;
};

/**
 * Tap opens the post. Long press starts selecting. In selection mode, tap toggles.
 * `readOnly` cards (public share page) only open.
 */
export const LinkCard = memo(function LinkCard({
  link,
  folderName,
  selecting,
  selected,
  onToggleSelect,
  onStartSelect,
  readOnly,
}: {
  link: CardLink;
  folderName?: string;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelect?: (id: string) => void;
  readOnly?: boolean;
}) {
  const c = useColors();
  const image = thumbnailUrl(link);
  const title = link.title || link.shared_text || link.resolved_url || link.url;
  const showDetail = () => router.push({ pathname: '/link/[id]', params: { id: link.id } });

  return (
    <Pressable
      onPress={() => (selecting ? onToggleSelect?.(link.id) : openLink(link))}
      onLongPress={readOnly || selecting ? undefined : () => onStartSelect?.(link.id)}
      accessibilityRole={selecting ? 'checkbox' : 'link'}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      accessibilityHint={readOnly ? undefined : selecting ? 'Selects this link' : 'Opens the post. Long press to select.'}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.thumb, { backgroundColor: c.surface }, selected && { borderColor: c.accent, borderWidth: 3 }]}>
        {image ? (
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <T style={[styles.placeholder, { color: c.muted }]} numberOfLines={1}>
            {PLATFORM_NAMES[link.platform]}
          </T>
        )}
        {link.status === 'pending' ? (
          <View style={[styles.corner, styles.right, { backgroundColor: c.bg }]}>
            <ActivityIndicator size="small" color={c.text} />
          </View>
        ) : null}
        {selecting ? (
          <View style={[styles.corner, styles.left]}>
            <Check checked={!!selected} />
          </View>
        ) : link.pinned ? (
          <View style={[styles.corner, styles.left, styles.pin, { backgroundColor: c.accent }]}>
            <T variant="label" style={{ color: c.onAccent }}>
              Pinned
            </T>
          </View>
        ) : null}
      </View>

      <View style={[styles.rule, { backgroundColor: c.line }]} />

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <T variant="label" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {PLATFORM_NAMES[link.platform]}
            {folderName ? `  /  ${folderName}` : ''}
          </T>
          {!readOnly && !selecting ? (
            <Pressable onPress={showDetail} hitSlop={12} accessibilityRole="button" accessibilityLabel="Link details">
              <T variant="label">•••</T>
            </Pressable>
          ) : null}
        </View>
        <T variant="heading" numberOfLines={2}>
          {title}
        </T>
        {link.description ? (
          <T variant="small" tone="muted" numberOfLines={2}>
            {link.description}
          </T>
        ) : null}
        {link.labels.length ? (
          <T variant="small" numberOfLines={1} style={{ fontFamily: fonts.medium }}>
            {link.labels.slice(0, 3).map((l) => `#${l}`).join('  ')}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1 },
  thumb: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholder: { fontFamily: fonts.black, fontSize: 22, letterSpacing: -0.5, paddingHorizontal: space.md },
  corner: { position: 'absolute', top: space.sm },
  left: { left: space.sm },
  right: { right: space.sm, padding: space.xs },
  pin: { paddingHorizontal: space.sm, paddingVertical: 3 },
  rule: { height: 2, marginTop: space.sm },
  body: { paddingTop: space.sm, gap: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
