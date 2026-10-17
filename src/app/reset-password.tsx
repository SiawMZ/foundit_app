import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Rule, T } from '@/components/ui';
import { isStrongPassword, PASSWORD_HINT } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';

/**
 * Where the "reset password" email lands (web). The link signs the user in with a recovery
 * session; here they choose a new password.
 */
export default function ResetPassword() {
  const c = useColors();
  const { session } = useStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = isStrongPassword(password) && confirm === password && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setMessage(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) setMessage(e.message);
    else setDone(true);
  }

  let body;
  if (!session) {
    body = (
      <>
        <T variant="title">This reset link doesn’t work any more.</T>
        <T tone="muted">It may have expired or already been used. Request a new one from the sign-in page.</T>
        <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </>
    );
  } else if (done) {
    body = (
      <>
        <T variant="title">Password changed.</T>
        <T tone="muted">You’re signed in as {session.user.email}. Use the new password next time.</T>
        <Button label="Go to my links" onPress={() => router.replace('/')} />
      </>
    );
  } else {
    body = (
      <>
        <T tone="muted">Choose a new password for {session.user.email}.</T>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder={PASSWORD_HINT}
          autoFocus
        />
        <View style={{ gap: space.sm }}>
          <Field
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={save}
          />
          {mismatch ? (
            <T variant="small" tone="danger">
              Passwords don’t match.
            </T>
          ) : null}
        </View>
        {message ? (
          <T variant="small" tone="danger">
            {message}
          </T>
        ) : null}
        <Button label="Save new password" onPress={save} loading={busy} disabled={!canSave} />
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          <View style={{ gap: space.sm }}>
            <View style={[styles.mark, { backgroundColor: c.accent }]} />
            <T style={[styles.brand, { color: c.text }]}>Linkbox</T>
          </View>
          <Rule strong />
          <T variant="label">01  New password</T>
          {body}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg },
  mark: { width: 28, height: 28, marginBottom: space.sm },
  brand: { fontFamily: fonts.black, fontSize: 52, lineHeight: 54, letterSpacing: -2 },
});
