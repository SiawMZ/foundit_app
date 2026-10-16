import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Rule, T } from '@/components/ui';
import { emailRedirect, isGoogleEnabled, sendPasswordReset, signInWithGoogle } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';

type Mode = 'in' | 'up' | 'forgot';
type Message = { text: string; tone: 'muted' | 'danger' };

const HEADINGS: Record<Mode, string> = {
  in: '01  Sign in',
  up: '01  Create account',
  forgot: '01  Reset password',
};

export default function SignIn() {
  const c = useColors();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isGoogleEnabled().then((on) => !cancelled && setGoogle(on));
    return () => {
      cancelled = true;
    };
  }, []);

  const mismatch = mode === 'up' && confirm.length > 0 && confirm !== password;
  const canSubmit =
    !!email.trim() &&
    (mode === 'forgot' || password.length >= 6) &&
    (mode !== 'up' || (confirm === password && !mismatch));

  function switchTo(next: Mode) {
    setMode(next);
    setMessage(null);
    setPassword('');
    setConfirm('');
  }

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy('email');
    setMessage(null);
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email.trim());
        setMessage({ text: `If there’s an account for ${email.trim()}, a reset link is on its way. Check your inbox.`, tone: 'muted' });
      } else if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: emailRedirect('/') },
        });
        if (error) throw error;
        if (!data.session) setMessage({ text: 'Check your email to confirm your account, then sign in.', tone: 'muted' });
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Something went wrong.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  async function continueWithGoogle() {
    setBusy('google');
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Google sign-in failed.', tone: 'danger' });
    } finally {
      // On web the page navigates away; this only matters if it didn't.
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <View style={{ gap: space.sm }}>
              <View style={[styles.mark, { backgroundColor: c.accent }]} />
              <T style={[styles.brand, { color: c.text }]}>Linkbox</T>
              <T variant="heading" tone="muted">
                Every saved post, from every app, in one place.
              </T>
            </View>
            <Rule strong />
            <T variant="label">{HEADINGS[mode]}</T>

            {mode !== 'forgot' && google ? (
              <>
                <Button
                  variant="secondary"
                  label="Continue with Google"
                  loading={busy === 'google'}
                  disabled={!!busy}
                  onPress={continueWithGoogle}
                />
                <View style={styles.or}>
                  <Rule style={{ flex: 1 }} />
                  <T variant="label" tone="muted">
                    or with email
                  </T>
                  <Rule style={{ flex: 1 }} />
                </View>
              </>
            ) : null}
            {mode === 'forgot' ? (
              <T tone="muted">Enter your account’s email and we’ll send you a link to choose a new password.</T>
            ) : null}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              onSubmitEditing={mode === 'forgot' ? submit : undefined}
            />
            {mode !== 'forgot' ? (
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                placeholder={mode === 'up' ? 'At least 6 characters' : undefined}
                onSubmitEditing={mode === 'in' ? submit : undefined}
              />
            ) : null}
            {mode === 'up' ? (
              <View style={{ gap: space.sm }}>
                <Field
                  label="Confirm password"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoComplete="new-password"
                  onSubmitEditing={submit}
                />
                {mismatch ? (
                  <T variant="small" tone="danger">
                    Passwords don’t match.
                  </T>
                ) : null}
              </View>
            ) : null}
            {mode === 'in' ? (
              <Button
                size="sm"
                variant="ghost"
                label="Forgot password?"
                onPress={() => switchTo('forgot')}
                style={styles.inlineLink}
              />
            ) : null}

            {message ? (
              <T variant="small" tone={message.tone}>
                {message.text}
              </T>
            ) : null}
            <Button
              label={mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
              onPress={submit}
              loading={busy === 'email'}
              disabled={!canSubmit || !!busy}
            />
            <Button
              variant="ghost"
              label={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              onPress={() => switchTo(mode === 'in' ? 'up' : 'in')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg },
  mark: { width: 28, height: 28, marginBottom: space.sm },
  brand: { fontFamily: fonts.black, fontSize: 52, lineHeight: 54, letterSpacing: -2 },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // Ghost buttons have padding; pull this one back to the text edge so it lines up flush-left.
  inlineLink: { alignSelf: 'flex-start', marginTop: -space.sm, marginLeft: -space.md },
});
