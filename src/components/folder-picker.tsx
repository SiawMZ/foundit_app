import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Field } from '@/components/ui';
import { useStore } from '@/lib/store';
import { space } from '@/lib/theme';

/** Pick at most one folder, or create a new one inline. */
export function FolderPicker({
  value,
  onChange,
}: {
  /** undefined = nothing chosen yet (bulk move). */
  value: string | null | undefined;
  onChange: (folderId: string | null) => void;
}) {
  const { folders, createFolder } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function create() {
    if (!name.trim()) return;
    try {
      const folder = await createFolder(name);
      onChange(folder.id);
      setName('');
      setCreating(false);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder');
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.wrap}>
        <Chip label="No folder" active={value === null} onPress={() => onChange(null)} />
        {folders.map((f) => (
          <Chip key={f.id} label={f.name} active={value === f.id} onPress={() => onChange(f.id)} />
        ))}
        {!creating ? <Chip label="+ New folder" onPress={() => setCreating(true)} /> : null}
      </View>
      {creating ? (
        <View style={styles.newRow}>
          <View style={{ flex: 1 }}>
            <Field
              placeholder={error ?? 'Folder name'}
              value={name}
              onChangeText={setName}
              autoFocus
              onSubmitEditing={create}
              maxLength={60}
            />
          </View>
          <Button label="Create" onPress={create} disabled={!name.trim()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  newRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
