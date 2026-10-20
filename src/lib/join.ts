import { Platform } from 'react-native';

/**
 * An invite opened while signed out: remembered through sign-in so the join page can come back.
 * Web keeps it for the tab's session (sign-in with Google reloads the page); the app keeps it in memory.
 */
const KEY = 'linkbox.pendingJoin';
let pending: string | null = null;

export function setPendingJoin(token: string) {
  pending = token;
  if (Platform.OS === 'web') {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {}
  }
}

export function takePendingJoin(): string | null {
  let token = pending;
  pending = null;
  if (Platform.OS === 'web') {
    try {
      token = token ?? sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch {}
  }
  return token;
}
