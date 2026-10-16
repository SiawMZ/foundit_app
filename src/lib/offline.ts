import AsyncStorage from '@react-native-async-storage/async-storage';

/** A share or paste that couldn't reach the server; saved again once there's a connection. */
export type QueuedSave = {
  id: string;
  /** Only flushed for the same account that queued it. */
  userId: string;
  text: string;
  folderId: string | null;
  queuedAt: string;
};

const KEY = 'linkbox:queued-saves';

export async function loadQueue(): Promise<QueuedSave[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedSave[]) : [];
  } catch {
    return [];
  }
}

export async function persistQueue(queue: QueuedSave[]) {
  try {
    if (queue.length) await AsyncStorage.setItem(KEY, JSON.stringify(queue));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Storage full or unavailable: the queue still lives in memory for this session.
  }
}

/** Errors that mean "no connection" rather than "the server said no". */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const message =
    e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);
  return /network request failed|failed to fetch|networkerror|load failed|fetch failed|network error/i.test(message);
}

export function queueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
