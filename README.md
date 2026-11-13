# Junubify

Junubify is a React + Vite music catalog with Supabase authentication, database-backed published tracks and likes, audio uploads, and artist payout-request records.

## Local setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and set the project URL and **anon/public** key. Never put a Supabase service-role key in a `VITE_` variable or browser code.
4. In Supabase Auth, configure the site URL and allowed redirect URLs for localhost and your Vercel domain. Configure email confirmation and SMTP for production.
5. Install and run:

```bash
npm install
npm run dev
```

## Vercel deployment

- Import the repository with the project root at the repository root.
- Build command: `npm run build`
- Output directory: `dist`
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables for Preview and Production, then redeploy.
- The `.npmrc` setting permits standard dependency install scripts such as esbuild's binary setup; Vite's production build depends on esbuild.

## Production functionality and safeguards

- Supabase Auth provides email/password sign-up and sign-in.
- Public catalog queries return published tracks only. New artist submissions are stored as `pending` and do not appear in the public catalog until an authorized reviewer changes their status.
- Audio files are limited to MP3/WAV and 50 MB in both the client and Supabase bucket configuration. Storage writes are scoped to each user's folder.
- Likes and payout-request records are protected with row-level security. Never disable RLS or expose a service-role key in the client.
- Payout requests are only recorded for review. No wallet provider is connected and no money is moved by this application yet.
- Subscription/payment screens must not report a subscription as active until a real payment provider is integrated with a server-side checkout endpoint and signature-verified webhooks. Store provider secrets only in server-side environment variables.
- The dashboard still contains demo catalog entries as a fallback when the database has no published rows; replace them with licensed audio and approved catalog records before public launch.

## Before launch

Set up a track review/admin workflow, production email delivery, abuse/rate limiting, privacy/terms pages, backups, monitoring, and a real payment provider. Obtain rights for all audio and artwork. Test auth redirects and uploads using Vercel Preview deployments before promoting to Production.
