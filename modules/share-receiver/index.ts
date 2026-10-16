import { requireOptionalNativeModule, type EventSubscription } from 'expo';

type ShareReceiverModule = {
  getInitialShare(): string | null;
  addListener(event: 'onShare', listener: (e: { text: string }) => void): EventSubscription;
};

// Missing on web, iOS and Expo Go — callers treat that as "no share support".
export default requireOptionalNativeModule<ShareReceiverModule>('ShareReceiver');
