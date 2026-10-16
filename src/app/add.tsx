import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PLATFORM_NAMES } from '../../supabase/functions/_shared/url';
import { FolderPicker } from '@/components/folder-picker';
import { Button, Field, SectionLabel } from '@/components/ui';
import { displayTitle } from '@/lib/filter';
import { useStore, type SaveResult } from '@/lib/store';
import { font, radius, space, useColors } from '@/lib/theme';

/**
 * Two ways in:
 * - "+ Add": paste a link, pick a folder, save.
 * - Shared from another app (?shared=…): saved immediately, then the user can file it and go back.
 */
export default function Add() {
  const c = useColors();
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const { saveFromText, updateLink, links } = useStore();
  const [text, setText] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const savedShare = useRef<string | null>(null);

  // Live version of the saved link, so the preview fills in as enrichment finishes.
  const saved = result ? (links.find((l) => l.id === result.link.id) ?? result.link) : null;

  async function save(input: string, folder: string | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await saveFromText(input, folder);
      setResult(r);
      setFolderId(r.link.folder_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this link.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (shared && savedShare.current !== shared) {
      savedShare.current = shared;
      setText(shared);
      void save(shared, null);
    }
  }, [shared]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseFolder(id: string | null) {
    setFolderId(id);
    if (saved) await updateLink(saved.id, { folder_id: id }).catch(() => {});
  }

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
    // Came from another app's share sheet: drop back into that app.
    if (shared && Platform.OS === 'android') BackHandler.exitApp();
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {!saved ? (
        <>
          <Field
            label="Link or shared text"
            placeholder="https://www.instagram.com/p/…"
            value={text}
            onChangeText={setText}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!shared}
            multiline
          />
          <SectionLabel>Folder</SectionLabel>
          <FolderPicker value={folderId} onChange={setFolderId} />
          {error ? <Text style={{ color: c.danger, fontSize: font.sm }}>{error}</Text> : null}
          <Button label="Save" onPress={() => save(text, folderId)} loading={busy} disabled={!text.trim()} />
        </>
      ) : (
        <>
          <View style={[styles.preview, { borderColor: c.border }]}>
            <Text style={[styles.status, { color: c.muted }]}>
              {result?.duplicate ? 'Already saved' : 'Saved'} · {PLATFORM_NAMES[saved.platform]}
              {saved.status === 'pending' ? ' · fetching preview…' : ''}
            </Text>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>
              {displayTitle(saved)}
            </Text>
            {saved.description ? (
              <Text style={{ color: c.muted, fontSize: font.sm }} numberOfLines={3}>
                {saved.description}
              </Text>
            ) : null}
            {saved.labels.length ? (
              <Text style={{ color: c.text, fontSize: font.sm }}>{saved.labels.map((l) => `#${l}`).join('  ')}</Text>
            ) : null}
          </View>
          <SectionLabel>Folder</SectionLabel>
          <FolderPicker value={folderId} onChange={chooseFolder} />
          <Button label="Done" onPress={done} />
          {!shared ? (
            <Button
              variant="ghost"
              label="Save another"
              onPress={() => {
                setResult(null);
                setText('');
              }}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  preview: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  status: { fontSize: font.xs, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: font.lg, fontWeight: '600', lineHeight: 24 },
});
