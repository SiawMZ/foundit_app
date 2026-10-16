import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PLATFORM_NAMES } from '../../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { Button, Chip, Field, SectionLabel } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { openLink, thumbnailUrl } from '@/lib/open';
import { useStore } from '@/lib/store';
import { font, radius, space, useColors } from '@/lib/theme';

export default function LinkDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { links, updateLink, deleteLink, enrich } = useStore();
  const link = links.find((l) => l.id === id);

  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!link) {
    return (
      <View style={[styles.missing, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.muted }}>This link no longer exists.</Text>
      </View>
    );
  }

  const save = (patch: Parameters<typeof updateLink>[1]) =>
    updateLink(link.id, patch).catch((e) => setError(e instanceof Error ? e.message : 'Could not save'));

  function addLabel() {
    const l = newLabel.trim().toLowerCase().replace(/^#/, '');
    setNewLabel('');
    if (l && !link!.labels.includes(l)) void save({ labels: [...link!.labels, l] });
  }

  async function remove() {
    if (await confirm('Delete link?', 'This removes it from Linkbox only, not from the original app.')) {
      await deleteLink(link!.id);
      router.back();
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: PLATFORM_NAMES[link.platform] }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
          <View style={styles.wrap}>
            {link.labels.map((l) => (
              <Chip
                key={l}
                label={`${l}  ×`}
                onPress={() => save({ labels: link.labels.filter((x) => x !== l) })}
              />
            ))}
          </View>
          <Field placeholder="Add label and press enter" value={newLabel} onChangeText={setNewLabel} onSubmitEditing={addLabel} autoCapitalize="none" />
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
      </ScrollView>
    </>
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
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
