import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import ShareReceiver from '../../modules/share-receiver';

/**
 * Opens the save screen whenever text is shared to the app from another app's share sheet.
 * Shares that arrive before sign-in are held until there's a session.
 */
export function useShareListener(signedIn: boolean) {
  // Cold start: the app was launched by a share.
  const [pending, setPending] = useState<string | null>(() => ShareReceiver?.getInitialShare() ?? null);

  useEffect(() => {
    if (!ShareReceiver) return;
    const sub = ShareReceiver.addListener('onShare', ({ text }) => setPending(text));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || !signedIn) return;
    // Let the navigator mount first on a cold start.
    const t = setTimeout(() => {
      router.push({ pathname: '/add', params: { shared: pending } });
      setPending(null);
    }, 0);
    return () => clearTimeout(t);
  }, [pending, signedIn]);
}
