import { Linking, Platform } from 'react-native';

import { isWebUrl } from '../../supabase/functions/_shared/url';
import { supabase } from './supabase';

/**
 * Open the post where it lives. On Android, https links to instagram.com, tiktok.com, etc.
 * are claimed by the installed app (App Links), so this lands in the right app.
 */
export async function openLink(link: { url: string; resolved_url?: string | null }) {
  const url = [link.resolved_url, link.url].find((u): u is string => !!u && isWebUrl(u));
  if (!url) return;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

export function thumbnailUrl(link: {
  thumbnail_path: string | null;
  updated_at?: string;
  created_at: string;
}): string | null {
  if (!link.thumbnail_path) return null;
  const { data } = supabase.storage.from('thumbnails').getPublicUrl(link.thumbnail_path);
  // updated_at busts the image cache when "Refresh preview" replaces the file.
  return `${data.publicUrl}?v=${Date.parse(link.updated_at ?? link.created_at)}`;
}
