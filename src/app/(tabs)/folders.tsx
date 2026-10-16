import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Rule, ScreenHeader, Sheet, T } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { folderShareUrl, shareUrl } from '@/lib/share-link';
import { useStore } from '@/lib/store';
import { pad2, space, useColors } from '@/lib/theme';
import type { Folder } from '@/lib/types';

const MAX_WIDTH = 760;

export default function Folders() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { folders, links, createFolder, renameFolder, deleteFolder } = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [sharing, setSharing] = useState<Folder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = new Map<string, number>();
  let unfiled = 0;
  for (const l of links) {
    if (l.folder_id) counts.set(l.folder_id, (counts.get(l.folder_id) ?? 0) + 1);
    else unfiled++;
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const create = () =>
    name.trim() &&
    run(async () => {
      await createFolder(name);
      setName('');
    });

  async function remove(f: Folder) {
    const n = counts.get(f.id) ?? 0;
    const ok = await confirm(
      `Delete “${f.name}”?`,
      n ? `Its ${n} link${n === 1 ? '' : 's'} stay in Linkbox, unfiled.` : 'The folder is empty.',
    );
    if (ok) await run(() => deleteFolder(f.id));
  }

  const open = (folder: string) => router.navigate({ pathname: '/', params: { folder, label: '' } });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={folders}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingTop: insets.top + space.xl }]}
        ListHeaderComponent={
          <View style={{ gap: space.xl, paddingBottom: space.lg }}>
            <ScreenHeader title="Folders" meta={`${pad2(2)}  Folders · ${folders.length}`} />
            <View style={styles.newRow}>
              <View style={{ flex: 1 }}>
                <Field placeholder="New folder name" value={name} onChangeText={setName} maxLength={60} onSubmitEditing={create} />
              </View>
              <Button label="Create" disabled={!name.trim()} onPress={create} />
            </View>
            {error ? <T tone="danger">{error}</T> : null}
            <Row index="—" name="Unfiled" count={unfiled} onPress={() => open('none')} />
          </View>
        }
        ListEmptyComponent={
          <T tone="muted" style={{ paddingVertical: space.xl }}>
            No folders yet. Create one above, or select links on the Links tab and move them.
          </T>
        }
        renderItem={({ item, index }) =>
          editing === item.id ? (
            <View style={[styles.newRow, { paddingVertical: space.md }]}>
              <View style={{ flex: 1 }}>
                <Field value={editName} onChangeText={setEditName} autoFocus maxLength={60} />
              </View>
              <Button
                label="Save"
                disabled={!editName.trim()}
                onPress={() =>
                  run(async () => {
                    await renameFolder(item.id, editName);
                    setEditing(null);
                  })
                }
              />
              <Button variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
            </View>
          ) : (
            <Row
              index={pad2(index + 1)}
              name={item.name}
              count={counts.get(item.id) ?? 0}
              shared={!!item.share_token}
              onPress={() => open(item.id)}
              actions={
                <>
                  <Button size="sm" variant="secondary" label={item.share_token ? 'Shared' : 'Share'} onPress={() => setSharing(item)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Rename"
                    onPress={() => {
                      setEditing(item.id);
                      setEditName(item.name);
                    }}
                  />
                  <Button size="sm" variant="ghost" label="Delete" onPress={() => remove(item)} />
                </>
              }
            />
          )
        }
      />
      <ShareSheet folder={sharing ? (folders.find((f) => f.id === sharing.id) ?? null) : null} onClose={() => setSharing(null)} />
    </View>
  );
}

function Row({
  index,
  name,
  count,
  shared,
  onPress,
  actions,
}: {
  index: string;
  name: string;
  count: number;
  shared?: boolean;
  onPress: () => void;
  actions?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={onPress}
          accessibilityRole="link"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.rowMain,
            (pressed || hovered) && { backgroundColor: c.surface },
          ]}>
          <T variant="number" tone="accent" style={{ width: 24 }}>
            {index}
          </T>
          <View style={{ flex: 1 }}>
            <T variant="title" numberOfLines={1}>
              {name}
            </T>
            <T variant="label" tone="muted">
              {count} {count === 1 ? 'link' : 'links'}
              {shared ? '  ·  Public link on' : ''}
            </T>
          </View>
        </Pressable>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      <Rule />
    </View>
  );
}

function ShareSheet({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const { shareFolder, unshareFolder } = useStore();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const url = folder?.share_token ? folderShareUrl(folder.share_token) : null;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!folder}
      onClose={() => {
        setNote(null);
        onClose();
      }}
      title={folder ? `Share “${folder.name}”` : 'Share'}>
      {!folder?.share_token ? (
        <>
          <T tone="muted">
            Anyone with the link can see this folder’s posts — titles, previews and descriptions — without signing in. Your
            notes stay private. You can turn the link off at any time.
          </T>
          <Button label="Create share link" loading={busy} onPress={() => act(() => shareFolder(folder!.id))} />
        </>
      ) : (
        <>
          <T variant="label" tone="muted">
            Public link
          </T>
          {url ? (
            <T selectable>
              {url}
            </T>
          ) : (
            <T tone="muted">
              The link is on, but the web app isn’t hosted yet, so there’s no public address to send. Set
              EXPO_PUBLIC_WEB_URL once the web version is deployed.
            </T>
          )}
          {url ? (
            <Button
              label="Copy / share link"
              onPress={() =>
                act(async () => {
                  const r = await shareUrl(url, folder.name);
                  if (r === 'copied') setNote('Copied to clipboard.');
                })
              }
            />
          ) : null}
          <Button variant="danger" label="Turn off link" loading={busy} onPress={() => act(() => unshareFolder(folder.id))} />
        </>
      )}
      {note ? <T variant="small" tone="muted">{note}</T> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  newRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  rowMain: { flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, paddingRight: space.sm },
  actions: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
});
