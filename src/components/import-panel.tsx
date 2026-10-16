import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { PLATFORM_NAMES } from '../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { Button, Field, T } from '@/components/ui';
import { extractPostLinks, pickTextFiles, type FoundLink } from '@/lib/import';
import { useStore, type ImportProgress } from '@/lib/store';
import { space, useColors } from '@/lib/theme';

/**
 * Bring in posts saved before Linkbox: pick files from an Instagram / TikTok data download
 * (web), or paste any text that contains post links (web and phone).
 */
export function ImportPanel() {
  const c = useColors();
  const { links, importLinks } = useStore();
  const [pasted, setPasted] = useState('');
  const [found, setFound] = useState<FoundLink[] | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'muted' | 'danger' } | null>(null);

  const existing = useMemo(() => new Set(links.map((l) => l.normalized_url)), [links]);
  const fresh = useMemo(() => (found ?? []).filter((f) => !existing.has(f.normalized)), [found, existing]);
  const byPlatform = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fresh) counts.set(f.platform, (counts.get(f.platform) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [fresh]);

  function scan(texts: string[]) {
    const all = extractPostLinks(texts.join('\n'));
    setFound(all);
    setMessage(all.length ? null : { text: 'No post links found in that.', tone: 'muted' });
  }

  async function chooseFiles() {
    const texts = await pickTextFiles();
    if (texts.length) scan(texts);
  }

  async function run() {
    setMessage(null);
    setProgress({ done: 0, total: fresh.length });
    try {
      const added = await importLinks(fresh, folderId, setProgress);
      setMessage({
        text: `Imported ${added} ${added === 1 ? 'post' : 'posts'}. Previews and labels are filling in — keep the app open for a few minutes.`,
        tone: 'muted',
      });
      setFound(null);
      setPasted('');
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed.', tone: 'danger' });
    } finally {
      setProgress(null);
    }
  }

  return (
    <View style={{ gap: space.md }}>
      <T tone="muted">
        Bring in posts you saved before Linkbox. Download your data from Instagram or TikTok (JSON or HTML), unzip it,
        and pick the saved/favourites files — Linkbox finds every post link inside. Or paste any text that contains
        links.
      </T>
      {Platform.OS === 'web' ? (
        <Button variant="secondary" label="Choose files…" onPress={chooseFiles} disabled={!!progress} />
      ) : (
        <T variant="small" tone="muted">
          Data downloads are easiest to import from the website on a computer.
        </T>
      )}
      <Field
        placeholder="…or paste text with links here"
        value={pasted}
        onChangeText={setPasted}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      {pasted.trim() ? (
        <Button variant="secondary" size="sm" label="Find links" onPress={() => scan([pasted])} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      {found?.length ? (
        <View style={[styles.result, { borderColor: c.line }]}>
          <T variant="title">
            {fresh.length} new {fresh.length === 1 ? 'post' : 'posts'}
          </T>
          <T variant="small" tone="muted">
            Found {found.length}
            {found.length - fresh.length ? ` · ${found.length - fresh.length} already in Linkbox` : ''}
          </T>
          {byPlatform.map(([p, n]) => (
            <View key={p} style={styles.row}>
              <T variant="label" style={{ flex: 1 }}>
                {PLATFORM_NAMES[p as keyof typeof PLATFORM_NAMES] ?? p}
              </T>
              <T variant="number" tone="muted">
                {n}
              </T>
            </View>
          ))}
          {fresh.length ? (
            <>
              <T variant="label" tone="muted" style={{ marginTop: space.sm }}>
                Put them in a folder (optional)
              </T>
              <FolderPicker value={folderId} onChange={setFolderId} />
              <Button
                label={progress ? `Importing ${progress.done} / ${progress.total}…` : `Import ${fresh.length} posts`}
                loading={false}
                disabled={!!progress}
                onPress={run}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {message ? (
        <T variant="small" tone={message.tone}>
          {message.text}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  result: { borderWidth: 2, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
});
