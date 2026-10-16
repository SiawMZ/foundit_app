import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinkCard } from '@/components/link-card';
import { ScreenHeader, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';
import type { SharedFolder } from '@/lib/types';

const MAX_WIDTH = 1280;

/** Public, read-only view of a shared folder. Works without signing in. */
export default function SharedFolderPage() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [folder, setFolder] = useState<SharedFolder | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_shared_folder', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setState('missing');
      else {
        setFolder(data as SharedFolder);
        setState('ready');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const contentWidth = Math.min(width, MAX_WIDTH);
  const columns = Math.max(2, Math.floor((contentWidth - space.xl * 2) / 230));

  if (state !== 'ready' || !folder) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {state === 'loading' ? (
          <ActivityIndicator color={c.text} />
        ) : (
          <View style={{ gap: space.sm, maxWidth: 380, padding: space.xl }}>
            <T variant="title">This link isn’t available.</T>
            <T tone="muted">The folder may have been unshared or deleted.</T>
          </View>
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      key={columns}
      data={folder.links}
      numColumns={columns}
      keyExtractor={(l) => l.id}
      columnWrapperStyle={{ gap: space.lg }}
      ItemSeparatorComponent={() => <View style={{ height: space.xl }} />}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / columns, maxWidth: `${100 / columns}%` }}>
          <LinkCard link={item} readOnly />
        </View>
      )}
      ListHeaderComponent={
        <View style={{ gap: space.md, paddingBottom: space.xl }}>
          <T style={{ fontFamily: fonts.black, fontSize: 16, letterSpacing: -0.4, color: c.accent }}>Linkbox</T>
          <ScreenHeader title={folder.name} meta={`Shared folder · ${folder.links.length} links`} />
        </View>
      }
      ListEmptyComponent={<T tone="muted">This folder is empty.</T>}
      contentContainerStyle={[styles.list, { width: contentWidth, paddingTop: insets.top + space.xl }]}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { alignSelf: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxxl },
});
