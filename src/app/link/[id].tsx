import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PLATFORM_NAMES } from '../../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { LabelEditor } from '@/components/label-editor';
import { Button, Field, SectionLabel } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { openLink, thumbnailUrl } from '@/lib/open';
import { useStore } from '@/lib/store';
import { font, radius, space, useColors } from '@/lib/theme';

export default function LinkDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { links, updateLink, deleteLink, enrich } = useStore();
  const link = links.find((l) => l.id === id);

  const [error, setError] = useState<string | null>(null);

  if (!link) {
    return (
      <Frame title="">
        <Text style={{ color: c.muted, textAlign: 'center' }}>This link no longer exists.</Text>
      </Frame>
    );
  }

  const save = (patch: Parameters<typeof updateLink>[1]) =>
    updateLink(link.id, patch).catch((e) => setError(e instanceof Error ? e.message : 'Could not save'));

  async function remove() {
    if (await confirm('Delete link?', 'This removes it from Linkbox only, not from the original app.')) {
      await deleteLink(link!.id);
      close();
    }
  }

  return (
    <Frame title={PLATFORM_NAMES[link.platform]}>
        {thumbnailUrl(link) ? (
          <Image source={thumbnailUrl(link)} style={[styles.image, { backgroundColor: c.surface }]} contentFit="cover" />
        ) : null}

        <Button label={`Open in ${PLATFORM_NAMES[link.platform]}`} onPress={() => openLink(link)} />

        <View style={{ gap: space.xs }}>
          <Text style={[styles.meta, { color: c.muted }]}>
            Saved {new Date(link.created_at).toLocaleDateString()}
            {link.author ? ` · ${link.author}` : ''}
            {link.status === 'pending' ? ' · fetching preview…' : ''}
          </Text>
          {link.description ? <Text style={[styles.desc, { color: c.text }]}>{link.description}</Text> : null}
          {link.status === 'failed' && link.error ? (
            <Text style={[styles.meta, { color: c.muted }]}>Preview unavailable: {link.error}</Text>
          ) : null}
          <Text style={[styles.url, { color: c.muted }]} numberOfLines={2} selectable>
            {link.resolved_url ?? link.url}
          </Text>
        </View>

        <SavedField
          key={`title:${link.title}`}
          label="Title"
          saved={link.title}
          placeholder="Add a title"
          onSave={(title) => save({ title })}
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>Labels</SectionLabel>
          <LabelEditor labels={link.labels} onChange={(labels) => save({ labels })} />
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Folder</SectionLabel>
          <FolderPicker value={link.folder_id} onChange={(folder_id) => save({ folder_id })} />
        </View>

        <SavedField
          key={`note:${link.note}`}
          label="Note"
          saved={link.note}
          placeholder="Why did you save this?"
          multiline
          onSave={(note) => save({ note })}
        />

        {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={link.pinned ? 'Unpin' : 'Pin to top'}
            onPress={() => save({ pinned: !link.pinned })}
            style={{ flex: 1 }}
          />
          <Button
            variant="secondary"
            label="Refresh preview"
            loading={link.status === 'pending'}
            onPress={() => enrich(link.id)}
            style={{ flex: 1 }}
          />
        </View>
        <Button variant="danger" label="Delete" onPress={remove} />
    </Frame>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Phone: a normal screen. Web: a centered panel over the grid that closes when you click
 * the backdrop, press Escape or the × button.
 */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Capture phase: react-native-web text inputs stop key events from bubbling.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      // First Escape leaves the field (which saves it), the next one closes the panel.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.blur();
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const body = (
    <ScrollView
      style={Platform.OS === 'web' ? undefined : { backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );

  if (Platform.OS !== 'web') {
    return (
      <>
        <Stack.Screen options={{ title }} />
        {body}
      </>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close details"
      />
      <View style={[styles.panel, { backgroundColor: c.bg, borderColor: c.border }]}>
        <View style={[styles.panelHeader, { borderColor: c.border }]}>
          <Text style={[styles.panelTitle, { color: c.text }]}>{title}</Text>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={{ color: c.text, fontSize: font.xl, lineHeight: font.xl }}>×</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </View>
  );
}

/** Text field that saves on blur. Keyed on the saved value, so it resets when the row changes. */
function SavedField({
  saved,
  onSave,
  ...props
}: {
  saved: string | null;
  onSave: (value: string | null) => void;
  label: string;
  placeholder: string;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(saved ?? '');
  return (
    <Field
      {...props}
      value={value}
      onChangeText={setValue}
      onBlur={() => value !== (saved ?? '') && onSave(value.trim() || null)}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  meta: { fontSize: font.sm },
  desc: { fontSize: font.md, lineHeight: 22 },
  url: { fontSize: font.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.md },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { width: '100%', maxWidth: 640, maxHeight: '92%', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  panelTitle: { fontSize: font.lg, fontWeight: '600' },
});
