import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { font, space, useColors } from '@/lib/theme';
import type { Folder } from '@/lib/types';

export default function Folders() {
  const c = useColors();
  const { session, folders, links, createFolder, renameFolder, deleteFolder } = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const l of links) if (l.folder_id) counts.set(l.folder_id, (counts.get(l.folder_id) ?? 0) + 1);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function remove(f: Folder) {
    const n = counts.get(f.id) ?? 0;
    const ok = await confirm(
      `Delete “${f.name}”?`,
      n ? `Its ${n} link${n === 1 ? '' : 's'} will stay in Linkbox, unfiled.` : 'The folder is empty.',
    );
    if (ok) await run(() => deleteFolder(f.id));
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      data={folders}
      keyExtractor={(f) => f.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.newRow}>
          <View style={{ flex: 1 }}>
            <Field placeholder="New folder name" value={name} onChangeText={setName} maxLength={60} onSubmitEditing={() => name.trim() && run(async () => { await createFolder(name); setName(''); })} />
          </View>
          <Button label="Create" disabled={!name.trim()} onPress={() => run(async () => { await createFolder(name); setName(''); })} />
        </View>
      }
      ListFooterComponent={
        <View style={{ gap: space.md, marginTop: space.xl }}>
          {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
          <Text style={{ color: c.muted, fontSize: font.sm }}>Signed in as {session?.user.email}</Text>
          <Button variant="secondary" label="Sign out" onPress={() => supabase.auth.signOut()} />
        </View>
      }
      ListEmptyComponent={<Text style={{ color: c.muted, paddingVertical: space.xl }}>No folders yet.</Text>}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
      renderItem={({ item }) =>
        editing === item.id ? (
          <View style={[styles.row, styles.newRow]}>
            <View style={{ flex: 1 }}>
              <Field value={editName} onChangeText={setEditName} autoFocus maxLength={60} />
            </View>
            <Button
              label="Save"
              disabled={!editName.trim()}
              onPress={() => run(async () => { await renameFolder(item.id, editName); setEditing(null); })}
            />
            <Button variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
          </View>
        ) : (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
              <Text style={{ color: c.muted, fontSize: font.sm }}>
                {counts.get(item.id) ?? 0} links
              </Text>
            </View>
            <Pressable onPress={() => { setEditing(item.id); setEditName(item.name); }} hitSlop={8}>
              <Text style={{ color: c.text, fontSize: font.sm }}>Rename</Text>
            </Pressable>
            <Pressable onPress={() => remove(item)} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: font.sm }}>Delete</Text>
            </Pressable>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  newRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md },
  name: { fontSize: font.md, fontWeight: '600' },
});
