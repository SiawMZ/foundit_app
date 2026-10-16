import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see .env.example)');
}

export const supabase = createClient(url, key, {
  auth: {
    // Web uses localStorage by default; native needs AsyncStorage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Web: an OAuth or email-link failure comes back as ?error_description=… (or #…) on whatever page
 * Supabase redirected to. Read it once at startup, before the router redirects to /sign-in and
 * drops the URL, so the sign-in screen can show why it failed.
 */
export const authRedirectError: string | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const { search, hash, pathname } = window.location;
  const params = new URLSearchParams(search);
  new URLSearchParams(hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const message = params.get('error_description') ?? params.get('error');
  if (!message) return null;
  window.history.replaceState(null, '', pathname);
  return message.replace(/\+/g, ' ');
})();

// Only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
