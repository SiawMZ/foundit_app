import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLATFORM_NAMES } from '../../../supabase/functions/_shared/url';
import { Button, Field, Rule, ScreenHeader, SectionLabel, T } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { labelCounts } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { pad2, space, useColors } from '@/lib/theme';

export default function Profile() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { session, links, folders } = useStore();
  const user = session?.user;

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.platform, (counts.get(l.platform) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [links]);
  const tagCount = useMemo(() => labelCounts(links).length, [links]);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space.xl }]}
      keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Profile" meta={`${pad2(4)}  Account`} />

      <SectionLabel index="01">Library</SectionLabel>
      <View style={styles.stats}>
        <Stat value={links.length} label="Links" />
        <Stat value={folders.length} label="Folders" />
        <Stat value={tagCount} label="Tags" />
      </View>
      {platforms.length ? (
        <View style={{ gap: space.xs }}>
          {platforms.map(([p, n]) => (
            <View key={p} style={styles.barRow}>
              <T variant="label" style={{ width: 110 }}>
                {PLATFORM_NAMES[p as keyof typeof PLATFORM_NAMES] ?? p}
              </T>
              <View style={[styles.bar, { backgroundColor: c.surface }]}>
                <View style={{ width: `${(n / links.length) * 100}%`, height: '100%', backgroundColor: c.text }} />
              </View>
              <T variant="number" tone="muted" style={{ width: 32, textAlign: 'right' }}>
                {n}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      <SectionLabel index="02">Account</SectionLabel>
      <View style={{ gap: space.xs }}>
        <T variant="label" tone="muted">Email</T>
        <T variant="heading">{user?.email}</T>
        {user?.created_at ? (
          <T variant="small" tone="muted">
            Member since {new Date(user.created_at).toLocaleDateString()}
          </T>
        ) : null}
      </View>
      <ChangePassword />
      <Button variant="secondary" label="Sign out" onPress={() => supabase.auth.signOut()} />

      <SectionLabel index="03">Your data</SectionLabel>
      <T tone="muted">Download every link, folder, label and note as a JSON file — a backup you can keep or move elsewhere.</T>
      <ExportButton />

      <SectionLabel index="04">Delete account</SectionLabel>
      <DeleteAccount />
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <T variant="display">{value}</T>
      <T variant="label" tone="muted">{label}</T>
    </View>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setNote(error ? error.message : 'Password updated.');
    if (!error) setPassword('');
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.inline}>
        <View style={{ flex: 1 }}>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />
        </View>
        <Button label="Change" variant="secondary" loading={busy} disabled={password.length < 6} onPress={save} />
      </View>
      {note ? <T variant="small" tone="muted">{note}</T> : null}
    </View>
  );
}

function ExportButton() {
  const { links, folders } = useStore();
  const [note, setNote] = useState<string | null>(null);

  async function exportData() {
    const folderNames = new Map(folders.map((f) => [f.id, f.name]));
    const data = {
      exported_at: new Date().toISOString(),
      folders: folders.map((f) => ({ name: f.name, created_at: f.created_at })),
      links: links.map((l) => ({
        url: l.resolved_url ?? l.url,
        original_url: l.url,
        platform: l.platform,
        title: l.title,
        description: l.description,
        author: l.author,
        note: l.note,
        labels: l.labels,
        folder: l.folder_id ? (folderNames.get(l.folder_id) ?? null) : null,
        pinned: l.pinned,
        saved_at: l.created_at,
      })),
    };
    const json = JSON.stringify(data, null, 2);
    const name = `linkbox-export-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setNote(`Downloaded ${name}`);
    } else {
      // No file APIs in this build: hand the JSON to the share sheet (save to Drive, email, …).
      await Share.share({ title: name, message: json });
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Button variant="secondary" label={`Export ${links.length} links`} disabled={!links.length} onPress={exportData} />
      {note ? <T variant="small" tone="muted">{note}</T> : null}
    </View>
  );
}

function DeleteAccount() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const ok = await confirm(
      'Delete your account?',
      'This permanently deletes your account, links, folders and thumbnails. Export first if you want a copy. This cannot be undone.',
      'Delete forever',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error: fnError } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (fnError) {
      setBusy(false);
      setError('Could not delete the account. Please try again.');
      return;
    }
    await supabase.auth.signOut();
  }

  return (
    <View style={{ gap: space.sm }}>
      <T tone="muted">Permanently removes your account and everything in it.</T>
      <Button variant="danger" label="Delete account" loading={busy} onPress={remove} />
      {error ? <T tone="danger">{error}</T> : null}
      <Rule />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: space.lg },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { flex: 1, height: 10 },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
});
