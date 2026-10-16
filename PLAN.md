# Linkbox — plan

"Linkbox" is a working name; the official name is not decided yet.

One place for posts saved across Instagram, Xiaohongshu, TikTok, Facebook and the web.
Tapping a saved link opens it in the original app.

## Decisions

| Topic | Decision |
|---|---|
| Client | Expo (SDK 58) + Expo Router + TypeScript. Android + web from one codebase. |
| Backend | Supabase: Postgres, auth, storage, edge functions. |
| Share into app | Android `ACTION_SEND` intent filter + a small local Expo module (`modules/share-receiver`). `expo-share-intent` does not support SDK 58 yet. |
| Enrichment | Edge function `enrich`: resolves short links, fetches preview (oEmbed / Open Graph), copies the thumbnail into storage (platform image URLs expire), asks Claude for a short description + labels. |
| Labels | AI creates them freely, English, lowercase, 1–4 per link, reusing existing ones. Stored as `text[]` on the link. User can edit; the field suggests existing labels. |
| Folders | One link → at most one folder. |
| Auth | Email + password (single user for now, ready for more later via RLS). |
| Search/filter/sort | Done on the client over all of the user's links (fast for thousands of rows). |

## Data model

```
folders  (id, user_id, name, created_at)                      unique(user_id, name)
links    (id, user_id, url, normalized_url, resolved_url, platform,
          title, description, author, thumbnail_path, shared_text,
          note, labels text[], folder_id → folders, pinned,
          status: pending | ready | failed, error,
          created_at, updated_at)                               unique(user_id, normalized_url)
```

Row-level security: every row is readable/writable only by its `user_id`.

## Save flow

1. Share from another app (or paste on web) → client extracts the first URL from the shared text,
   normalizes it (strips tracking params), detects platform, inserts a `pending` row.
   Duplicate → show the existing link instead.
2. Client calls `enrich(link_id)`; UI shows a placeholder card until status becomes `ready`/`failed`.
3. On failure the card still works: platform icon, shared text, editable title.

## Status

Built and verified on web (local Supabase), 2026-10-16. Not yet verified: the Android share sheet
(needs an EAS build) and AI labels (needs `ANTHROPIC_API_KEY`).

## MVP (this phase)

- [x] Sign in / sign up
- [x] Grid of links with thumbnail, title, description, platform, labels
- [x] Add by paste (web + Android), share from other apps (Android)
- [x] Auto preview + AI labels
- [x] Folders: create / rename / delete, move link
- [x] Search, filter (platform, folder, label), sort (date, name)
- [x] Link detail: open in original app, edit title/note/labels/folder, pin, delete
- [x] Label suggestions while typing
- [x] Web: details panel closes on click-outside / Escape
- [x] Turn on AI labels (Claude Haiku 5.5)
- [ ] Test the Android share flow on the owner's phone (dev build installed; share sheet not confirmed yet)

## Phase 2 — features and Swiss redesign (2026-10-16)

- [x] Swiss Style: Inter Tight, black/white + one red, sharp corners, numbered sections
- [x] Tabs on phone (Links, Folders, Tags, Profile), sidebar with folders on wide screens
- [x] Clearly different header actions (outlined "Select", red "+ Add")
- [x] Multi-select cards → move to folder / delete
- [x] Tag pool with search that lights up matching tags; tap a tag to filter
- [x] Profile: stats, change password, sign out, export JSON, delete account
- [x] Shareable read-only folder links (`/s/<token>`), revocable
- [x] Previews for Xiaohongshu (embedded page data) and Threads (Meta crawler)
- [ ] Deploy to hosted Supabase: `db push` (folder sharing) and deploy `enrich` + `delete-account`
- [ ] Host the web app (needed for share links to work for others), then set `EXPO_PUBLIC_WEB_URL`
- [ ] Standalone "preview" APK that works without the PC (EAS env vars for Supabase URL/key)

## Suggested next

- Offline save queue for shares made without internet
- One-time onboarding showing "Share → Linkbox"
- Bulk add/remove labels in selection mode

## Later

- Quick-save overlay (translucent activity) instead of opening the full app
- Import Instagram / TikTok data exports
- Dead-link checks, CSV export
- Design polish: motion, empty-state illustrations, app icon and splash in the Swiss style
- Publishing: privacy policy, private storage bucket with signed URLs

## Fix before deploying / publishing

- **Email confirmation lands on a broken page.** The confirmation link confirms the account, then
  redirects to the Supabase **Site URL**, which still has the default `http://localhost:3000`, so users
  see an error or unrelated page. Fix: set Authentication → URL Configuration → Site URL to the hosted
  web app (and add it to Redirect URLs), make sure **Confirm email** is on, and ideally have the
  link open the app on phones (deep link via the `linkbox://` scheme) with a "You're confirmed — sign in"
  screen. Found 2026-10-16 while testing on Android.
