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

## Notes

- Instagram and Facebook often hide previews behind a login. The link still saves and opens; the title falls back to the shared text, and you can edit it.
- Thumbnails are copied into Supabase Storage because platform image URLs expire.
- The thumbnails bucket is public with unguessable paths. Switch to a private bucket + signed URLs before publishing.
- `ENRICH_MODEL` (function secret) changes the model used for labels; default `claude-haiku-5-5` (about $0.10 per 1,000 links).
