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
| Auth | Email + password (with confirm-password on sign-up and a reset-password email), plus Google. Ready for more users via RLS. |
| Search/filter/sort | Done on the client over all of the user's links (fast for thousands of rows). |

## Data model

```
folders  (id, user_id, name, created_at)                      unique(user_id, name)
links    (id, user_id, url, normalized_url, resolved_url, platform,
          title, description, author, thumbnail_path, shared_text,
          note, labels text[], folder_id → folders, pinned,
          status: pending | ready | failed, error,
          created_at, updated_at, collab_folder_id)
          unique nulls not distinct (user_id, normalized_url, collab_folder_id), unique(collab_folder_id, normalized_url)
folder_members (folder_id, user_id, role: owner | member)     RPC access only
profiles (id → auth.users, display_name)                        own row; others' names via RPCs
```

Row-level security: every row is readable/writable only by its `user_id`. Members of a collaborative folder
see each other's links through the `get_joined_links` RPC (public fields only, never notes).

## Save flow

1. Share from another app (or paste on web) → client extracts the first URL from the shared text,
   normalizes it (strips tracking params), detects platform, inserts a `pending` row.
   Duplicate → show the existing link instead.
2. Client calls `enrich(link_id)`; UI shows a placeholder card until status becomes `ready`/`failed`.
3. On failure the card still works: platform icon, shared text, editable title.

## Status

Live (2026-10-17): web on Vercel, Android standalone `preview` build 1.0.1 with EAS Update, hosted
Supabase with AI labels (Haiku 5.5). Share sheet verified on the owner's phone. No EAS update has been
published yet, so update delivery is still unproven.

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
- [x] Test the Android share flow on the owner's phone (Instagram → Linkbox works on phone and web)

## Phase 2 — features and Swiss redesign (2026-10-16)

- [x] Swiss Style: Inter Tight, black/white + one red, sharp corners, numbered sections
- [x] Tabs on phone (Links, Folders, Tags, Profile), sidebar with folders on wide screens
- [x] Clearly different header actions (outlined "Select", red "+ Add")
- [x] Multi-select cards → move to folder / delete
- [x] Tag pool with search that lights up matching tags; tap a tag to filter
- [x] Profile: stats, change password, sign out, export JSON, delete account
- [x] Shareable read-only folder links (`/s/<token>`), revocable
- [x] Previews for Xiaohongshu (embedded page data) and Threads (Meta crawler)
- [x] Deploy to hosted Supabase: `db push` (folder sharing) and deploy `enrich` + `delete-account`
- [x] Host the web app on Vercel: https://founditapp-red.vercel.app (builds from GitHub `main`)
- [x] Vercel env vars point at the hosted Supabase (verified 2026-10-16)
- [x] EAS env vars (preview + production): Supabase URL/key and `EXPO_PUBLIC_WEB_URL`
- [x] Standalone "preview" APK built 2026-10-16
- [x] EAS Update configured (channel `preview`, runtime = app version); needs one rebuild to take effect
- [x] Install the EAS-Update-enabled preview build (1.0.1)
- [x] EAS update delivery confirmed on the phone (2026-10-17: offline saving + import)
- [x] Supabase Auth → URL Configuration: Site URL = https://founditapp-red.vercel.app, Redirect URLs =
      `https://founditapp-red.vercel.app/**` and `linkbox://**` (confirm + reset emails and Google sign-in need these)
- [x] Login: forgot password (email → `/reset-password`), confirm password on sign-up, Google button (2026-10-16)
- [x] Google sign-in works end to end (2026-10-17; the client secret had to be re-pasted in Supabase)

## Phase 3 (2026-10-17)

- [x] Offline save queue: saves without a connection are kept on the device and retried automatically
- [x] Import from Instagram / TikTok data downloads (web file picker) or pasted text; post links only
- [x] Sign-in page shows OAuth / email-link errors from the redirect URL
- [ ] Quick-save pop-up: owner likes it; decide later (native change, needs a rebuild)

## Phase 4 (2026-10-19)

- [x] Installable website (PWA): `public/manifest.json`, icons in `public/icons/` (from `assets/images/icon.png`,
      already maskable-safe), head tags in `public/index.html` (Expo's template for `web.output: "single"`).
      No service worker. Goes live with a Vercel deploy (push); no phone update.
- [x] "Ask AI" search: an AI chip next to the search field. Claude (Haiku 5.5) turns the question into search terms
      only (`ask` edge function, structured output: keywords, labels from the user's own list, platform); the app
      searches the links locally (`rankByTerms` in `src/lib/filter.ts`). Claude never sees saved links or picks results,
      so prompt injection can at most produce bad keywords; nothing found → empty list.
      Limits: question 3–200 chars, runs on submit only, per user 20/hour + 100/day, app-wide 1000/day
      (secrets `ASK_PER_HOUR`, `ASK_PER_DAY`, `ASK_GLOBAL_PER_DAY`), logged in `ask_log` (no question text stored).
- [ ] Go live: `npx supabase db push` (ask_log), `npx supabase functions deploy ask`, push to `main` (Vercel),
      `npm run update:phone -- "..."` (JS only, no rebuild)

## Phase 5: collaborative folders (2026-10-20)

- [x] Invite link per folder (`/join/<token>`, sign-in required, owner can turn it off, max 20 people)
- [x] Members add their own links; only the adder edits; the owner removes any link or member
- [x] All links / search / Ask AI include joined folders, one card per post ("In 2 folders"); "Added by" names
- [x] Read-only details for others' links with **Save to my library**
- [x] Leave → private copy of the folder; leaver's links stay (owner takes them, notes cleared);
      no members left → normal folder again. Deleting a shared folder returns each member's links to them, unfiled
- [x] Display name in Profile (default: the part of the email before @)
- [x] Public read-only page lists every member's links
- [ ] Go live: `npx supabase db push`, `npx supabase functions deploy delete-account`, push to `main`,
      `npm run update:phone -- "..."` (no rebuild; invite links open the website, which offers "Open in Linkbox")
- Later: live updates and notifications when someone adds a link; roles beyond owner/member

## Suggested next

- "Update ready — Restart" bar once an EAS update has downloaded (JS only)
- Bulk add/remove labels in selection mode
- Refresh all missing previews (one button, reuses `enrich`)
- Keep the original saved date on imported posts (Instagram/TikTok exports include it)
- One-time onboarding showing "Share → Linkbox" (the Links empty state already says it)

## Later

- Dead-link checks, CSV export
- Design polish: motion, empty-state illustrations, app icon and splash in the Swiss style
- Publishing: privacy policy (thumbnails stay in a public bucket: paths are two UUIDs, and files are
  deleted with their link)

## Security (review 2026-10-17)

Done in code. Goes live with `npx supabase db push`, `npx supabase functions deploy enrich` and
`npx supabase functions deploy delete-account`, then a Vercel deploy (push) and an EAS update for the app parts.

- [x] Saved links must be http(s) (DB check + `openLink` guard): a `javascript:` link on a shared page
      could run in a viewer's signed-in session
- [x] `enrich` fetches safely: http(s) on ports 80/443 only; private, loopback and link-local addresses
      blocked (after DNS and on every redirect); max 5 redirects; size-limited reads for pages and images
- [x] `enrich_log` table records every enrich call per user (audit log, service role only). Limits per user:
      200 previews/hour, 60 AI calls/hour, 300 AI calls/day (function secrets `ENRICH_PER_HOUR`,
      `ENRICH_AI_PER_HOUR`, `ENRICH_AI_PER_DAY`). Over the AI limit a link still gets its preview, without AI labels
- [x] AI prompt input capped and page text marked as untrusted; functions return plain error messages
- [x] Thumbnails: jpeg/png/webp/gif only, max 5 MB (bucket limits too), removed when their link is deleted
- [x] Size limits on link fields; a link can only go into its owner's folder; shared pages list only the owner's links
- [x] Phone Google sign-in uses PKCE (the `linkbox://` redirect carries a one-time code, not tokens)
- [x] Passwords: at least 8 characters with letters and numbers (app + local config)

Owner, in dashboards:

- [x] Supabase → Authentication → Providers → Email: minimum password length 8, requirements "letters and digits" (2026-10-17)
- [ ] Custom SMTP (e.g. Resend free tier): the built-in email service only sends to the project's team
      members, a few per hour, so other people would not get confirmation emails
- [x] Anthropic console: monthly spend limit for the API key (2026-10-17)
- [ ] Delete orphaned thumbnails from links deleted before this change (Storage → thumbnails)

## Fix before deploying / publishing

- **No error reporting** from the phone app or functions (e.g. Sentry free tier / EAS Observe); decide which,
  it needs a rebuild. Until then the `enrich_log` table and Supabase function logs are the only trail.
- **Free Supabase projects pause after ~7 days without activity**, and the free plan has no backups you
  can restore yourself: upgrade, or schedule `npx supabase db dump` and keep the project active.
- **Final name, icon and Android package** must be settled before the first Play Store upload (the package is permanent).
- Nice-to-have: security headers on Vercel (CSP, frame-ancestors), show only known sign-in error
  messages, clear the offline queue on sign-out.

- **Email confirmation lands on a broken page.** The confirmation link confirms the account, then
  redirects to the Supabase **Site URL**, which still has the default `http://localhost:3000`, so users
  see an error or unrelated page. Fix: set Authentication → URL Configuration → Site URL to the hosted
  web app (and add it to Redirect URLs), make sure **Confirm email** is on, and ideally have the
  link open the app on phones (deep link via the `linkbox://` scheme) with a "You're confirmed — sign in"
  screen. Found 2026-10-16 while testing on Android.
