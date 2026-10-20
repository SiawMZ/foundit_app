import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Rule, ScreenHeader, SectionLabel, Sheet, T } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { folderInviteUrl, folderShareUrl, shareUrl } from '@/lib/share-link';
import { useStore } from '@/lib/store';
import { pad2, space, useColors } from '@/lib/theme';
import type { Folder, FolderMember } from '@/lib/types';

const MAX_WIDTH = 760;

export default function Folders() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { session, folders, links, joinedLinks, createFolder, renameFolder, deleteFolder } = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = session?.user.id;
  const own = folders.filter((f) => f.user_id === me);
  const joined = folders.filter((f) => f.user_id !== me);

  const counts = new Map<string, number>();
  let unfiled = 0;
  for (const l of [...links, ...joinedLinks]) {
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
      f.role
        ? 'Everyone loses access. Each person’s links go back to their own library, unfiled.'
        : n
          ? `Its ${n} link${n === 1 ? '' : 's'} stay in Linkbox, unfiled.`
          : 'The folder is empty.',
    );
    if (ok) await run(() => deleteFolder(f.id));
  }

  const open = (folder: string) => router.navigate({ pathname: '/', params: { folder, label: '' } });
  const sharingFolder = folders.find((f) => f.id === sharing) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={own}
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
              detail={[
                item.member_count ? `${item.member_count} people` : '',
                item.share_token ? 'Public link on' : '',
              ]}
              onPress={() => open(item.id)}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    label={item.member_count || item.share_token || item.invite_token ? 'Shared' : 'Share'}
                    onPress={() => setSharing(item.id)}
                  />
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
        ListFooterComponent={
          joined.length ? (
            <View style={{ gap: space.sm, paddingTop: space.xl }}>
              <SectionLabel>Joined</SectionLabel>
              {joined.map((f, i) => (
                <Row
                  key={f.id}
                  index={pad2(i + 1)}
                  name={f.name}
                  count={counts.get(f.id) ?? 0}
                  detail={[`by ${f.owner_name ?? 'someone'}`, f.member_count ? `${f.member_count} people` : '']}
                  onPress={() => open(f.id)}
                  actions={<Button size="sm" variant="secondary" label="Members" onPress={() => setSharing(f.id)} />}
                />
              ))}
            </View>
          ) : undefined
        }
      />
      {sharingFolder?.user_id === me ? (
        <ShareSheet folder={sharingFolder} onClose={() => setSharing(null)} />
      ) : (
        <JoinedSheet folder={sharingFolder} onClose={() => setSharing(null)} />
      )}
    </View>
  );
}

function Row({
  index,
  name,
  count,
  detail = [],
  onPress,
  actions,
}: {
  index: string;
  name: string;
  count: number;
  detail?: string[];
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
              {[`${count} ${count === 1 ? 'link' : 'links'}`, ...detail].filter(Boolean).join('  ·  ')}
            </T>
          </View>
        </Pressable>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      <Rule />
    </View>
  );
}

/** Runs an action with a busy flag and shows the result or error under it. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'muted' | 'danger' } | null>(null);
  async function act(fn: () => Promise<string | void>) {
    setBusy(true);
    setNote(null);
    try {
      const done = await fn();
      if (done) setNote({ text: done, tone: 'muted' });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'Something went wrong', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }
  return { busy, note, setNote, act };
}

/** Owner: invite people to add links, see members, and the public read-only link. */
function ShareSheet({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const { shareFolder, unshareFolder, createInvite, revokeInvite } = useStore();
  const { busy, note, setNote, act } = useAction();
  const publicUrl = folder?.share_token ? folderShareUrl(folder.share_token) : null;
  const inviteUrl = folder?.invite_token ? folderInviteUrl(folder.invite_token) : null;

  async function copy(url: string, title: string) {
    const r = await shareUrl(url, title);
    return r === 'copied' ? 'Copied to clipboard.' : undefined;
  }

  return (
    <Sheet
      visible={!!folder}
      onClose={() => {
        setNote(null);
        onClose();
      }}
      title={folder ? `Share “${folder.name}”` : 'Share'}>
      {folder ? (
        <>
          <SectionLabel index="01">Invite people</SectionLabel>
          <T tone="muted">
            People with the invite link can sign in, join and add their own links. Everyone sees the folder’s posts; notes
            stay private.
          </T>
          {inviteUrl ? (
            <>
              <T selectable>{inviteUrl}</T>
              <View style={styles.buttons}>
                <Button label="Copy / share invite" onPress={() => act(() => copy(inviteUrl, `Join “${folder.name}”`))} />
                <Button variant="danger" label="Turn off invite" loading={busy} onPress={() => act(() => revokeInvite(folder.id))} />
              </View>
            </>
          ) : (
            <Button
              label={folder.invite_token ? 'Invite link on' : 'Create invite link'}
              loading={busy}
              onPress={() => act(async () => void (await createInvite(folder.id)))}
            />
          )}
          {folder.invite_token && !inviteUrl ? (
            <T tone="muted">Set EXPO_PUBLIC_WEB_URL so the app knows the website address for invite links.</T>
          ) : null}
          {folder.role ? <Members folder={folder} canRemove /> : null}

          <SectionLabel index="02">Public read-only link</SectionLabel>
          {!folder.share_token ? (
            <>
              <T tone="muted">
                Anyone with the link can see this folder’s posts — titles, previews and descriptions — without signing in.
                Notes stay private. You can turn the link off at any time.
              </T>
              <Button
                variant="secondary"
                label="Create public link"
                loading={busy}
                onPress={() => act(async () => void (await shareFolder(folder.id)))}
              />
            </>
          ) : (
            <>
              {publicUrl ? <T selectable>{publicUrl}</T> : null}
              <View style={styles.buttons}>
                {publicUrl ? (
                  <Button variant="secondary" label="Copy / share link" onPress={() => act(() => copy(publicUrl, folder.name))} />
                ) : null}
                <Button variant="danger" label="Turn off link" loading={busy} onPress={() => act(() => unshareFolder(folder.id))} />
              </View>
            </>
          )}
        </>
      ) : null}
      {note ? <T variant="small" tone={note.tone}>{note.text}</T> : null}
    </Sheet>
  );
}

/** Member of someone else's folder: who's in it, and leave. */
function JoinedSheet({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const { leaveFolder } = useStore();
  const { busy, note, setNote, act } = useAction();

  async function leave() {
    if (!folder) return;
    const ok = await confirm(
      `Leave “${folder.name}”?`,
      'You keep a copy of every post as a normal folder of your own. Links you added stay in this folder for the others.',
      'Leave',
    );
    if (!ok) return;
    await act(async () => {
      const r = await leaveFolder(folder.id);
      onClose();
      router.navigate({ pathname: '/', params: { folder: r.folder_id, label: '' } });
    });
  }

  return (
    <Sheet
      visible={!!folder}
      onClose={() => {
        setNote(null);
        onClose();
      }}
      title={folder ? `“${folder.name}”` : 'Folder'}>
      {folder ? (
        <>
          <T tone="muted">
            Shared by {folder.owner_name ?? 'its owner'}. You can add your own links to it; only you can edit them. Your notes stay
            private.
          </T>
          <Members folder={folder} />
          <Button variant="danger" label="Leave folder" loading={busy} onPress={leave} />
        </>
      ) : null}
      {note ? <T variant="small" tone={note.tone}>{note.text}</T> : null}
    </Sheet>
  );
}

function Members({ folder, canRemove }: { folder: Folder; canRemove?: boolean }) {
  const { getMembers, removeMember } = useStore();
  const [members, setMembers] = useState<FolderMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMembers(folder.id).then(
      (m) => !cancelled && setMembers(m),
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load members'),
    );
    return () => {
      cancelled = true;
    };
  }, [folder.id, folder.member_count, getMembers]);

  async function remove(m: FolderMember) {
    const ok = await confirm(
      `Remove ${m.name ?? 'this member'}?`,
      'They keep a copy of the folder as their own. Links they added stay here.',
      'Remove',
    );
    if (!ok) return;
    try {
      await removeMember(folder.id, m.user_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove member');
    }
  }

  return (
    <View style={{ gap: space.xs }}>
      <T variant="label" tone="muted">
        People · {members?.length ?? folder.member_count ?? '…'}
      </T>
      {members?.map((m) => (
        <View key={m.user_id} style={styles.member}>
          <T style={{ flex: 1 }} numberOfLines={1}>
            {m.name ?? 'Member'}
            {m.is_me ? ' (you)' : ''}
          </T>
          <T variant="label" tone="muted">
            {m.role === 'owner' ? 'Owner' : 'Member'}
          </T>
          {canRemove && m.role !== 'owner' ? (
            <Button size="sm" variant="ghost" label="Remove" onPress={() => remove(m)} />
          ) : null}
        </View>
      ))}
      {error ? <T variant="small" tone="danger">{error}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  newRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  rowMain: { flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, paddingRight: space.sm },
  actions: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
});
