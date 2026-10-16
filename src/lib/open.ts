import { Linking, Platform } from 'react-native';

import { supabase } from './supabase';
import type { Link } from './types';

/**
 * Open the post where it lives. On Android, https links to instagram.com, tiktok.com, etc.
 * are claimed by the installed app (App Links), so this lands in the right app.
 */
export async function openLink(link: Link) {
  const url = link.resolved_url ?? link.url;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

export function thumbnailUrl(link: Link): string | null {
  if (!link.thumbnail_path) return null;
  const { data } = supabase.storage.from('thumbnails').getPublicUrl(link.thumbnail_path);
  // updated_at busts the image cache when "Refresh preview" replaces the file.
  return `${data.publicUrl}?v=${Date.parse(link.updated_at)}`;
}
