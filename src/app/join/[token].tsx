import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Rule, T } from '@/components/ui';
import { setPendingJoin } from '@/lib/join';
import { useStore } from '@/lib/store';
import { space, useColors } from '@/lib/theme';
import type { InvitePreview } from '@/lib/types';

/** Invite link for a collaborative folder: shows the folder, then joins (after sign-in if needed). */
export default function Join() {
  const c = useColors();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, getInvite, joinFolder } = useStore();
  const [invite, setInvite] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = !!session;

  useEffect(() => {
    let cancelled = false;
    getInvite(token ?? '').then(
      (i) => !cancelled && setInvite(i),
      () => !cancelled && setInvite(null),
    );
    return () => {
      cancelled = true;
    };
  }, [token, getInvite, signedIn]);

  const openFolder = (id: string) => router.replace({ pathname: '/', params: { folder: id, label: '' } });

  async function join() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      openFolder(await joinFolder(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join this folder.');
      setBusy(false);
    }
  }

  function signIn() {
    if (token) setPendingJoin(token);
    router.push('/sign-in');
  }

  // A phone browser can hand the invite to the installed app instead.
  const phoneWeb = Platform.OS === 'web' && /android/i.test(navigator.userAgent);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <T variant="label" tone="muted">Linkbox · Invite</T>
        <Rule strong />
        {invite === undefined ? (
          <T tone="muted">Loading…</T>
        ) : invite === null ? (
          <>
            <T variant="title">This invite link is no longer valid.</T>
            <T tone="muted">Ask the folder’s owner for a new one.</T>
          </>
        ) : (
          <>
            <T variant="display">{invite.name}</T>
            <T tone="muted">
              Shared by {invite.owner_name ?? 'a Linkbox user'} · {invite.member_count}{' '}
              {invite.member_count === 1 ? 'person' : 'people'}
            </T>
            <T>
              Join to see this folder’s posts and add your own. Your notes stay private, and you can leave any time — you keep a
              copy of the folder when you do.
            </T>
            {!signedIn ? (
              <Button label="Sign in to join" onPress={signIn} />
            ) : invite.is_owner || invite.is_member ? (
              <>
                <T tone="muted">{invite.is_owner ? 'This is your folder.' : 'You’re already in this folder.'}</T>
                <Button label="Open folder" onPress={() => openFolder(invite.folder_id)} />
              </>
            ) : (
              <Button label="Join folder" loading={busy} onPress={join} />
            )}
            {phoneWeb && token ? (
              <Button variant="secondary" label="Open in the Linkbox app" onPress={() => Linking.openURL(`linkbox://join/${token}`)} />
            ) : null}
          </>
        )}
        {error ? <T tone="danger">{error}</T> : null}
        {signedIn ? (
          <View>
            <Button variant="ghost" label="Go to my links" onPress={() => router.replace('/')} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
});
