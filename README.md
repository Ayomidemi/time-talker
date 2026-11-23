# Hold

Keep what you said you would do.

Hold is a web/PWA accountability clock. It speaks the time on a half-hour or quarter-hour cadence, then asks you to check in: **On track**, **Slacking**, or **Break**. Gentle mode nudges lightly. Annoying mode keeps after you until you answer.

## Stack

- Next.js + TypeScript
- Web Speech API (works in the browser)
- Browser notifications for background nudges
- Supabase for auth + optional sync
- Deploy on Vercel

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Supabase keys, Hold runs in **local mode** (settings, commitments, and check-ins stay in your browser).

## Supabase setup

Supabase is for **optional sign-in** (name + email magic link), not a “sync box” in the UI.

1. Create a project at [supabase.com](https://supabase.com).
2. Put the project URL and anon key in `.env.local` (never put the database password in `NEXT_PUBLIC_*` vars).
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Under Authentication → URL configuration, add:
   - Site URL: `http://localhost:3000` (and your Vercel URL later)
   - Redirect URL: `http://localhost:3000/auth/callback`

On **You**, people can save a name and optionally email themselves a sign-in link.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Framework preset: **Next.js**.
4. Add the same `NEXT_PUBLIC_SUPABASE_*` env vars.
5. Deploy.

## What v1 includes

- Half-hour or quarter-hour spoken cadence
- Gentle vs annoying intensity
- Today’s commitments (up to 3)
- Check-in logging + recent honesty list
- PWA manifest for “Add to Home Screen”
- Supabase magic-link auth shell

## What’s next

- Sync commitments/check-ins to Supabase when signed in
- Web Push so annoying mode works after the tab is closed
- End-of-day spoken review
