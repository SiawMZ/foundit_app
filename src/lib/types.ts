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
  /** Set when the link is in a collaborative folder (scopes duplicate detection to that folder). */
  collab_folder_id?: string | null;
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
  /** Set while the folder has a public read-only link. */
  share_token: string | null;
  /** Set while people can join with an invite link (owner only sees it). */
  invite_token?: string | null;
  created_at: string;
  /** Collaborative folders only: my role, the owner's name and how many people are in it. */
  role?: 'owner' | 'member';
  owner_name?: string;
  member_count?: number;
};

/**
 * A card in the library. `added_by` is set on other members' links in a shared folder (read-only for
 * me; their note is never sent). `inFolders` lists every folder the post is in, across copies.
 */
export type LibraryLink = Link & { added_by?: string | null; inFolders?: string[] };

export type FolderMember = { user_id: string; name: string | null; role: 'owner' | 'member'; is_me: boolean };

export type LeaveResult = { folder_id: string; folder_name: string; copied: number; skipped: number };

export type InvitePreview = {
  folder_id: string;
  name: string;
  owner_name: string | null;
  member_count: number;
  is_owner: boolean;
  is_member: boolean;
};

/** What the public share page receives (see get_shared_folder in the migrations). */
export type SharedFolder = {
  name: string;
  links: Pick<
    Link,
    'id' | 'url' | 'platform' | 'title' | 'description' | 'author' | 'thumbnail_path' | 'shared_text' | 'labels' | 'created_at'
  >[];
};

export type LinkPatch = Partial<Pick<Link, 'title' | 'note' | 'labels' | 'folder_id' | 'pinned'>>;
