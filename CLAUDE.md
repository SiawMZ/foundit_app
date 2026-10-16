@AGENTS.md

# Linkbox (working name)

Personal app that collects links to posts saved across Instagram, Xiaohongshu, TikTok, Facebook and the web,
so they can be found in one place and opened back in the original app.
**Read [PLAN.md](PLAN.md) first** — decisions, data model, what's done and what's next. Keep it current
when scope changes. Setup and commands are in [README.md](README.md).

## Product decisions (from the owner)

- **Platforms:** Android first (owner's phone) + web. iOS is out of scope for now.
- **Audience:** personal use now; may publish once stable. Don't take shortcuts that block publishing
  (keep RLS, auth, per-user data).
- **Name:** "Linkbox" is a placeholder; the official name isn't decided (GitHub repo is `foundit_app`).
  Keep the Android package `com.siawmz.linkbox` unless asked — it only becomes permanent on Play Store release.
- **Labels:** created freely by AI, lowercase English, 1–4 per link; existing labels are reused when they fit.
  Users can add/remove labels manually; the field suggests existing labels as you type.
- **Folders:** a link is in at most one folder.
- **Sharing:** sharing a post from another app must save it without opening the app and pasting.
- **Web:** can save links by pasting. Link details open as a panel that closes on click-outside / Escape.
- **Navigation:** bottom tabs on phones (Links, Folders, Tags, Profile); the same sections as a left
  sidebar (with the folder list) on wide screens. Folder/tag filters are URL params on the Links tab.
- **Selecting:** long-press a card (or "Select") to multi-select; bulk move to folder or delete.
- **Shared folders:** read-only public page at `/s/<token>`, no sign-in; notes are never exposed;
  the owner can turn the link off.
- **Priority:** working features first; a full design pass comes later.

## Style: Swiss (International Typographic Style)

White paper, black type, **one red** (`accent`) for primary actions and the active item; sharp corners;
strong 2px rules; flush-left grotesk type (Inter Tight); numbered sections (01, 02 …); big numerals.
Dark mode follows the system. All text goes through `<T variant tone>` and the type scale in
`src/lib/theme.ts`; use `useColors`, `space`, `fonts`, `type` and the primitives in
`src/components/ui.tsx` (Button, Field, Chip, Check, Rule, SectionLabel, ScreenHeader, Sheet) —
no new colors, fonts or one-off sizes, and no `fontWeight` (use `fonts.*`, it's what Android needs).

## Architecture notes

- `supabase/functions/_shared/url.ts` is shared by the app and the edge function (URL extraction,
  normalization for duplicate detection, platform detection). Keep it free of Deno/React Native APIs.
- `links.thumbnail_path` stores a path in the `thumbnails` bucket; the app builds the URL
  (`thumbnailUrl` in `src/lib/open.ts`). Inside the local edge runtime `SUPABASE_URL` is an internal
  host, so never store full URLs from the function.
- The `enrich` function keeps the original URL when a redirect leaves the post's platform
  (bot checks / login walls like google.com/sorry).
- Android share intake is a local Expo module (`modules/share-receiver`) because `expo-share-intent`
  doesn't support SDK 58. It needs a dev/EAS build; Expo Go can't receive shares.
- Routes: `src/app/(tabs)/` (index = Links, folders, tags, profile) with `components/nav-bar.tsx` as the
  custom tab bar / sidebar; `add`, `link/[id]`, `sign-in`, and the public `s/[token]` outside the tabs.
- Folder sharing: `share_folder` RPC (security invoker) sets a token; `get_shared_folder` (security
  definer, anon-callable) returns only public fields. Share URLs need `EXPO_PUBLIC_WEB_URL` on phones.
- `delete-account` edge function removes the user's thumbnails then the auth user (rows cascade).
- Data and auth live in `src/lib/store.tsx`. Loading is driven by `onAuthStateChange`
  (the lint rule forbids setState directly in effects).

## Gotchas

- react-native-web `TextInput` stops keydown propagation — listen in the capture phase for global keys.
- EAS Build installs with `npm ci` on npm 10 (local is npm 11), which is stricter about peer dependencies.
  After changing dependencies, check the lock file in a scratch copy with
  `npx npm@10.9.9 ci --include=dev --ignore-scripts --dry-run`. The `overrides` entry in package.json
  exists for this: expo-modules-core's optional peer range doesn't include the worklets version Reanimated needs.
- Deno refuses npm versions published < 24h ago; pin `npm:@anthropic-ai/sdk@<version>` to an older release.
- App checks: `npx tsc --noEmit` and `npx eslint src modules` (`npx expo lint` fails on the installed
  ESLint version). Edge function: `deno check` inside `supabase/functions/enrich`.
- `.env.local` points at the **hosted** project (used by the owner's phone). To preview against the local
  stack use the `web-local` launch config (`.claude/web-local.mjs`, port 8090), which overrides the env
  for that process only. Don't run two dev servers long-term: both rewrite `.expo/types/router.d.ts`;
  if route types look stale (`/index`, stray non-route entries), restart a server and re-run tsc.
- Hosted changes need deploying: `npx supabase db push`, `npx supabase functions deploy <name>`.
- Local test account credentials are in `.env.local` (`LOCAL_TEST_*`, gitignored). `npx supabase db reset`
  wipes it; recreate with the auth signup endpoint.

## Workflow

- Commit and push to `main` on https://github.com/SiawMZ/foundit_app only when the owner asks.
- Verify UI changes in the browser (web) before reporting them done.
- Shipping: the website redeploys from `main` on Vercel (https://founditapp-red.vercel.app). The phone
  app (standalone `preview` build, channel `preview`) gets JS changes via EAS Update:
  `npm run update:phone -- "message"` — publishing reaches the owner's installed app, so only do it when
  asked. Native changes (new native package, native app.json config, SDK upgrade) need a rebuild:
  bump `expo.version` first (runtime policy `appVersion`), then `eas build --profile preview`.
- `npx eas-cli@latest update:configure` once duplicated the Android intent filter in app.json — check
  app.json after any EAS CLI command that rewrites config.
