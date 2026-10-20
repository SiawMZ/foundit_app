import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Rule, T } from '@/components/ui';
import { useStore } from '@/lib/store';
import { fonts, space, useColors } from '@/lib/theme';

const LABELS: Record<string, string> = {
  index: 'Links',
  folders: 'Folders',
  tags: 'Tags',
  profile: 'Profile',
};

/** Bottom tab bar on phones; a sidebar listing folders on wide screens. */
export function NavBar({ wide, ...props }: BottomTabBarProps & { wide: boolean }) {
  return wide ? <Sidebar {...props} /> : <BottomBar {...props} />;
}

function BottomBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const c = useColors();
  return (
    <View style={[styles.bottom, { backgroundColor: c.bg, borderTopColor: c.line, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const active = state.index === i;
        return (
          <Pressable
            key={route.key}
            onPress={() => navigateToTab(route.key)}
            accessibilityRole="tab"
            accessibilityLabel={LABELS[route.name] ?? route.name}
            accessibilityState={{ selected: active }}
            style={styles.bottomItem}>
            <View style={[styles.bottomMarker, { backgroundColor: active ? c.accent : 'transparent' }]} />
            <T variant="label" tone={active ? 'text' : 'muted'}>
              {LABELS[route.name] ?? route.name}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sidebar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const c = useColors();
  const { folders, links, joinedLinks } = useStore();
  const linksRoute = state.routes.find((r) => r.name === 'index');
  const params = (linksRoute?.params ?? {}) as { folder?: string; label?: string };
  const onLinks = state.routes[state.index]?.name === 'index';
  const activeFolder = onLinks ? params.folder : undefined;

  const counts = new Map<string, number>();
  for (const l of [...links, ...joinedLinks]) if (l.folder_id) counts.set(l.folder_id, (counts.get(l.folder_id) ?? 0) + 1);
  // All links shows one card per post, mine and other members' in shared folders.
  const total = new Set([...links, ...joinedLinks].map((l) => l.normalized_url)).size;

  return (
    <View style={[styles.side, { backgroundColor: c.bg, borderRightColor: c.line, paddingTop: insets.top + space.xl }]}>
      <T style={[styles.brand, { color: c.text }]}>Linkbox</T>
      <Button label="+ Add link" onPress={() => router.push('/add')} style={{ marginTop: space.lg }} />
      <ScrollView style={{ marginTop: space.xl }} contentContainerStyle={{ gap: space.xs }}>
        {state.routes.map((route, i) => {
          const active = state.index === i && !(route.name === 'index' && (params.folder || params.label));
          return (
            <View key={route.key}>
              <SideItem
                label={LABELS[route.name] ?? route.name}
                count={route.name === 'index' ? total : route.name === 'folders' ? folders.length : undefined}
                active={active}
                onPress={() =>
                  route.name === 'index'
                    ? router.navigate({ pathname: '/', params: { folder: '', label: '' } })
                    : navigateToTab(route.key)
                }
              />
              {route.name === 'folders' && folders.length ? (
                <View style={{ paddingLeft: space.xl, paddingBottom: space.sm }}>
                  {folders.map((f) => (
                    <SideItem
                      key={f.id}
                      label={f.name}
                      count={counts.get(f.id) ?? 0}
                      active={activeFolder === f.id}
                      small
                      onPress={() => router.navigate({ pathname: '/', params: { folder: f.id, label: '' } })}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <Rule />
      <T variant="small" tone="muted" style={{ paddingVertical: space.md }}>
        Every saved post, in one place.
      </T>
    </View>
  );
}

function SideItem({
  label,
  count,
  active,
  small,
  onPress,
}: {
  label: string;
  count?: number;
  active?: boolean;
  small?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: !!active }}
      style={({ hovered }: { hovered?: boolean }) => [
        styles.sideItem,
        small && styles.sideItemSmall,
        { backgroundColor: hovered && !active ? c.surface : 'transparent', borderLeftColor: active ? c.accent : 'transparent' },
      ]}>
      <T
        variant={small ? 'small' : 'heading'}
        tone={active ? 'accent' : 'text'}
        numberOfLines={1}
        style={[{ flex: 1 }, small && { fontFamily: active ? fonts.bold : fonts.medium }]}>
        {label}
      </T>
      {count !== undefined ? (
        <T variant="number" tone="muted">
          {count}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', borderTopWidth: 2 },
  // Marker + label + padding keeps each tab at least 48px tall.
  bottomItem: { flex: 1, alignItems: 'flex-start', paddingHorizontal: space.md, paddingBottom: space.lg },
  bottomMarker: { height: 3, alignSelf: 'stretch', marginBottom: space.lg },
  side: { width: 260, borderRightWidth: 2, paddingHorizontal: space.xl, paddingBottom: space.md },
  brand: { fontFamily: fonts.black, fontSize: 28, letterSpacing: -1, lineHeight: 30 },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderLeftWidth: 3,
  },
  sideItemSmall: { paddingVertical: 6 },
});
