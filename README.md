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

Email profiles are intentionally unverified, so anyone with an email can retrieve its saved name. They do not create a Supabase Auth session or grant access to private authenticated data. Signed-in preferences are stored in Supabase per email. Guest preferences and all check-ins remain in this browser. Guest commitments stay local; email profiles save commitments in Supabase by email and day. With the chosen email-only entry, anyone who enters an email can access that profile and its commitments.

1. Create a project at [supabase.com](https://supabase.com).
2. Put the project URL and anon key in `.env.local` as `NEXT_HOLD_SUPABASE_URL` and `NEXT_HOLD_SUPABASE_ANON_KEY` (never put the database password in these vars).
3. For a new database, run `supabase/schema.sql` in the Supabase SQL editor. For an existing installation, run `supabase/migrations/20261123_email_accounts.sql` instead; it preserves names from previous Auth accounts.

To apply the migration in the Supabase dashboard:

1. Open your project and choose **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/20261123_email_accounts.sql`.
3. Click **Run**. It is safe to rerun this migration; it does not overwrite existing names.
4. Refresh Hold and try a new email, then log out and enter the same email again. The second visit should skip name entry.

For display-name editing and cloud commitments, also run `supabase/migrations/20261123_profile_commitments.sql` in a new SQL Editor query after the email accounts migration. New installations using `schema.sql` already include both.

On **You**, name and email edits use a single **Save account details** button. Name-only edits update the existing profile; adding an email creates or opens that email profile. Guests can add an email to create or open a profile. Signed-in users load today's commitments from Supabase, and additions, completion changes, and removals save there. Existing guest/browser-only commitments are not automatically copied to an email profile.

Logout clears browser data and stops timers; Supabase profile names and commitments remain available when signing in again.

For unlimited commitments and optional deadlines, also run `supabase/migrations/20261123_commitment_deadlines.sql` after the profile commitments migration. Deadlines use your browser’s local date/time and are stored as UTC instants. Deadlines are displayed with each commitment; they do not schedule additional notifications.

To enable cloud preferences, run `supabase/migrations/20261124_preferences.sql` in Supabase SQL Editor. Changes to cadence, intensity, time-of-day wording, and the enabled switch save automatically. Preferences load on sign-in, survive logout, and never overwrite another email’s preferences. Only changed fields are sent. Browser notification permission remains device-specific.

## Checks

Run `npm run lint`, `npm test`, and `npm run build`. If your environment prevents Turbopack from starting its compiler process, use `npm run build -- --webpack`.

Manrope and Syne are bundled in `public/fonts` with their license, so builds do not need to download fonts.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Framework preset: **Next.js**.
4. Add the same `NEXT_HOLD_SUPABASE_*` env vars.
5. Deploy.

## What v1 includes

- Half-hour or quarter-hour spoken cadence
- Gentle vs annoying intensity
- Unlimited daily commitments with optional deadlines
- Check-in logging + recent honesty list
- PWA manifest for “Add to Home Screen”
- Optional email-only profiles with a local guest mode

## What’s next

- Sync check-ins to Supabase when signed in
- Web Push so annoying mode works after the tab is closed
- End-of-day spoken review
