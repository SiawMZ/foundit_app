# Linkbox

Save posts from Instagram, Xiaohongshu, TikTok, Facebook and the web into one place.
Open a saved link and it goes straight back to the original app.

- **Android:** share any post → pick **Linkbox** → saved, previewed and labelled.
- **Web:** paste a link.
- Auto preview (title, image, description), AI labels, folders, search, filter, sort.

See [PLAN.md](PLAN.md) for the decisions, data model and roadmap.

## Stack

Expo SDK 58 (React Native + web) · Expo Router · Supabase (Postgres, Auth, Storage, Edge Functions) · Claude for descriptions and labels.

```
src/app/                 screens (index = grid, add, link/[id], folders, sign-in)
src/lib/                 store (data + auth), filtering, theme, share listener
modules/share-receiver/  tiny native Android module that receives shared text
supabase/migrations/     database schema + row-level security
supabase/functions/      enrich (preview + thumbnail + AI labels), _shared/url.ts
```

## Run locally (web)

Needs Node 20+ and Docker Desktop running.

```bash
npm install
npx supabase start
npx supabase functions serve
npx expo start --web
```

`.env.local` points the app at the local Supabase. For AI labels, put your Anthropic API key in
`supabase/functions/.env` (copy `supabase/functions/.env.example`) and restart `functions serve`.
Without a key everything works except descriptions and labels.

Supabase Studio (browse tables) runs at http://127.0.0.1:54323.

## Run on your Android phone

The phone can't reach `127.0.0.1` on your PC, so use a hosted Supabase project:

1. Create a free project at supabase.com, then:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   npx supabase functions deploy enrich
   npx supabase secrets set ANTHROPIC_API_KEY=<your key>
   ```
2. Put the project's URL and publishable key in `.env.local` (see `.env.example`).
3. Build an installable APK in the cloud (no Android Studio needed):
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --profile development --platform android
   ```
   Install the APK from the link EAS gives you, then run `npx expo start` and open the project from the app.
   Use `--profile preview` for a standalone build that doesn't need the dev server.

The share-sheet entry only exists in these builds — **Expo Go can't receive shares**.

## Updating the phone app (EAS Update)

The standalone app (`preview` build) downloads new versions of the app's code by itself.
After changing app code, publish an update:

```bash
npm run update:phone -- "What changed"
```

On the phone, fully close Linkbox and reopen it. The first launch downloads the update in the
background; the next launch runs it (so it can take up to two restarts).

Updates can only change JavaScript, styling and images. **A new build is needed** when you:
add a package with native code, change native settings in `app.json` (permissions, intent filters,
icons, splash), or upgrade the Expo SDK. Then bump `expo.version` in `app.json` (e.g. 1.0.0 → 1.0.1)
and rebuild with `npx eas-cli@latest build --profile preview --platform android`.
Updates only reach builds with the same app version (runtime policy `appVersion`).

The website updates itself: Vercel redeploys on every push to `main`.

## Google sign-in

The "Continue with Google" button only appears once Google is enabled for the Supabase project.

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** → type *Web application*.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase dashboard → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret.
3. Authentication → URL Configuration: Site URL `https://founditapp-red.vercel.app`; Redirect URLs
   `https://founditapp-red.vercel.app/**` and `linkbox://**` (the phone app returns through its scheme).

Password-reset and confirmation emails always link to the web app (`/reset-password`, `/`), so they also need
those redirect URLs. Locally, `supabase/config.toml` already allows `http://localhost:8090/**`; open the emails
in Mailpit at http://127.0.0.1:54324.

## Notes

- Instagram and Facebook often hide previews behind a login. The link still saves and opens; the title falls back to the shared text, and you can edit it.
- Thumbnails are copied into Supabase Storage because platform image URLs expire.
- The thumbnails bucket is public with unguessable paths (`{user_id}/{link_id}`), images only, max 5 MB; a thumbnail is deleted with its link.
- `enrich` limits each user to 200 previews/hour and 60 AI calls/hour, 300/day (secrets `ENRICH_PER_HOUR`, `ENRICH_AI_PER_HOUR`, `ENRICH_AI_PER_DAY`). Every call is logged in the `enrich_log` table.
- `ENRICH_MODEL` (function secret) changes the model used for labels; default `claude-haiku-5-5` (about $0.10 per 1,000 links).
