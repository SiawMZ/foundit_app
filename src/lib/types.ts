import type { Platform } from '../../supabase/functions/_shared/url';

export type LinkStatus = 'pending' | 'ready' | 'failed';

export type Link = {
  id: string;
  user_id: string;
  url: string;
  normalized_url: string;
  resolved_url: string | null;
  platform: Platform;
  title: string | null;
  description: string | null;
  author: string | null;
  thumbnail_path: string | null;
  shared_text: string | null;
  note: string | null;
  labels: string[];
  folder_id: string | null;
  pinned: boolean;
  status: LinkStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type Folder = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type LinkPatch = Partial<Pick<Link, 'title' | 'note' | 'labels' | 'folder_id' | 'pinned'>>;
