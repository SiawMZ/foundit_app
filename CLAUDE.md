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
- **Priority:** working features first; a full design pass comes later.

## Style

Minimal, clean, grid-based, mostly black and white (dark mode follows the system).
Use the tokens in `src/lib/theme.ts` (`useColors`, `space`, `radius`, `font`) and the primitives in
`src/components/ui.tsx` — no new colors or one-off spacing values.

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
- Local test account credentials are in `.env.local` (`LOCAL_TEST_*`, gitignored). `npx supabase db reset`
  wipes it; recreate with the auth signup endpoint.

## Workflow

- Commit and push to `main` on https://github.com/SiawMZ/foundit_app only when the owner asks.
- Verify UI changes in the browser (web) before reporting them done.
