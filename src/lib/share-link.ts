import { Platform, Share } from 'react-native';

/**
 * Public URL of a shared folder. Needs the hosted web app's address (EXPO_PUBLIC_WEB_URL);
 * on web it falls back to the current origin.
 */
export function folderShareUrl(token: string): string | null {
  const base =
    process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '') ||
    (Platform.OS === 'web' ? window.location.origin : null);
  return base ? `${base}/s/${token}` : null;
}

/** Web: copies to the clipboard. Phone: opens the system share sheet. */
export async function shareUrl(url: string, title: string): Promise<'copied' | 'shared'> {
  if (Platform.OS === 'web') {
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
  await Share.share({ message: `${title}\n${url}`, title });
  return 'shared';
}
