# Hold

Keep what you said you would do.

Hold is a web/PWA accountability clock. It speaks the time on a half-hour or quarter-hour cadence, then asks you to check in: **On track**, **Slacking**, or **Break**. Gentle mode nudges lightly. Annoying mode keeps after you until you answer.

## Stack

- Next.js + TypeScript
- Web Speech API (works in the browser)
- Browser notifications for background nudges
- Supabase for optional email profiles
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

Start with an optional email. Skip it to enter a name and use Hold locally. An existing email opens Hold with its saved name; a new email asks for a name and creates a profile. No email verification is sent.

Email profiles are intentionally unverified, so anyone with an email can retrieve its saved name. They do not create a Supabase Auth session or grant access to private authenticated data. Settings, commitments, and check-ins remain in this browser for both guests and email profiles; they do not sync across devices.

1. Create a project at [supabase.com](https://supabase.com).
2. Put the project URL and anon key in `.env.local` (never put the database password in `NEXT_PUBLIC_*` vars).
3. For a new database, run `supabase/schema.sql` in the Supabase SQL editor. For an existing installation, run `supabase/migrations/20261123_email_accounts.sql` instead; it preserves names from previous Auth accounts.

To apply the migration in the Supabase dashboard:

1. Open your project and choose **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/20261123_email_accounts.sql`.
3. Click **Run**. It is safe to rerun this migration; it does not overwrite existing names.
4. Refresh Hold and try a new email, then log out and enter the same email again. The second visit should skip name entry.

On **You**, guests can add an email to create or open an email profile.

## Checks

Run `npm run lint`, `npm test`, and `npm run build`. If your environment prevents Turbopack from starting its compiler process, use `npm run build -- --webpack`.

Manrope and Syne are bundled in `public/fonts` with their license, so builds do not need to download fonts.

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
- Optional email-only profiles with a local guest mode

## What’s next

- Sync commitments/check-ins to Supabase when signed in
- Web Push so annoying mode works after the tab is closed
- End-of-day spoken review
