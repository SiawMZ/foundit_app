import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { font, space, useColors } from '@/lib/theme';

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
          <Text style={[styles.brand, { color: c.text }]}>Linkbox</Text>
          <Text style={[styles.tagline, { color: c.muted }]}>
            Every saved post, from every app, in one place.
          </Text>
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
          {message ? <Text style={{ color: c.muted, fontSize: font.sm }}>{message}</Text> : null}
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
  form: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: space.lg },
  brand: { fontSize: font.xxl, fontWeight: '700', letterSpacing: -0.5 },
  tagline: { fontSize: font.md, marginTop: -space.sm, marginBottom: space.sm },
});
