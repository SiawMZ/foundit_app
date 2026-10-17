import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Address of the hosted web app (EXPO_PUBLIC_WEB_URL). On web it falls back to the current origin,
 * so local previews send people back to the local server.
 */
export function webBaseUrl(): string | null {
  if (Platform.OS === 'web') return window.location.origin;
  return process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '') || null;
}

/** Matches the Supabase Auth password rules (minimum 8, letters_digits). */
export const PASSWORD_HINT = 'At least 8 characters, with letters and numbers';

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[a-z]/i.test(password) && /\d/.test(password);
}

/** Email links (confirm, reset) open in a browser, so they always point at the web app. */
export function emailRedirect(path = '/'): string | undefined {
  const base = webBaseUrl();
  return base ? `${base}${path}` : undefined;
}

/**
 * Whether Google is turned on for this Supabase project. Until it is, the authorize endpoint
 * only returns a JSON error page, so the button stays hidden.
 */
export async function isGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '' },
    });
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return !!settings.external?.google;
  } catch {
    return false;
  }
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: emailRedirect('/reset-password') });
  if (error) throw error;
}

/**
 * Web: full-page redirect to Google; supabase-js picks the session up from the URL on return.
 * Phone: opens Google in a browser tab that hands the tokens back through the linkbox:// scheme.
 */
export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return;
  }

  // PKCE: the linkbox:// redirect carries a one-time code instead of the tokens. Another app that
  // registers the same scheme could receive the redirect, but can't use the code without the
  // verifier, which stays in this process.
  const pkce = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_KEY!, {
    auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false, storageKey: 'linkbox-pkce' },
  });
  const redirectTo = Linking.createURL('/');
  const { data, error } = await pkce.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // closed by the user

  const params = authParams(result.url);
  if (params.error_description || params.error) throw new Error(params.error_description ?? params.error);
  if (!params.code) throw new Error('Google sign-in did not return a session.');
  const { data: exchanged, error: e } = await pkce.auth.exchangeCodeForSession(params.code);
  if (e) throw e;
  // Hand the session to the app's client, which stores and refreshes it.
  const { error: setError } = await supabase.auth.setSession({
    access_token: exchanged.session.access_token,
    refresh_token: exchanged.session.refresh_token,
  });
  if (setError) throw setError;
}

/** Auth results arrive in the query (?code=) or the fragment (#access_token=). */
function authParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [rest, hash = ''] = url.split('#');
  const query = rest.split('?')[1] ?? '';
  for (const part of [query, hash]) new URLSearchParams(part).forEach((v, k) => (out[k] = v));
  return out;
}
