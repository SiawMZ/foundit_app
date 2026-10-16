import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Rule, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';

export default function SignIn() {
  const c = useColors();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === 'up' && !data.session) setMessage('Check your email to confirm your account, then sign in.');
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.form}>
          <View style={{ gap: space.sm }}>
            <View style={[styles.mark, { backgroundColor: c.accent }]} />
            <T style={[styles.brand, { color: c.text }]}>Linkbox</T>
            <T variant="heading" tone="muted">
              Every saved post, from every app, in one place.
            </T>
          </View>
          <Rule strong />
          <T variant="label">{mode === 'in' ? '01  Sign in' : '01  Create account'}</T>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onSubmitEditing={submit}
          />
          {message ? <T variant="small" tone="muted">{message}</T> : null}
          <Button
            label={mode === 'in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email || password.length < 6}
          />
          <Button
            variant="ghost"
            label={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setMessage(null);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.xl },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg },
  mark: { width: 28, height: 28, marginBottom: space.sm },
  brand: { fontFamily: fonts.black, fontSize: 52, lineHeight: 54, letterSpacing: -2 },
});
