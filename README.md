# স্বপ্নতরী | SWAPNOTORI

বাংলাভিত্তিক সমবায় আর্থিক ব্যবস্থাপনা অ্যাপ। লক্ষ্য সুদূরপ্রসারী।

## Development

1. `npm install`
2. `.env.example` কপি করে `.env` তৈরি করুন; Supabase Project URL ও public anon/publishable key যোগ করুন।
3. `supabase/migrations`-এর migration Supabase SQL Editor-এ চালান।
4. Auth → Users থেকে প্রথম প্রশাসক ব্যবহারকারী তৈরি করুন। তারপর SQL Editor-এ ওই ঠিকানাকে administrator দিন: `update public.profiles set role='super_admin' where email='your-admin-email';`
5. `npm run dev`

Frontend-এ কখনো service-role key ব্যবহার করবেন না। প্রথম migration কোনো ডেমো সদস্য বা আর্থিক রেকর্ড তৈরি করে না।

## GitHub Pages deployment

GitHub Actions workflow build করবে এবং GitHub Pages-এ `dist/` প্রকাশ করবে। Repository Settings → Pages-এ “GitHub Actions” source নির্বাচন করুন। Repository secrets হিসেবে `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_ANON_KEY` যোগ করুন। Publishable/anon key browser-এ ব্যবহারের জন্য তৈরি; নিরাপত্তা RLS policy-তে প্রয়োগ হয়। Service-role key কখনো Pages secrets বা frontend build-এ যোগ করবেন না।

## Phase status

- Phase 1: React, TypeScript, Vite, branded responsive shell, login surface, PWA manifest, Supabase client/config foundation.
- Phase 2 foundation: initial PostgreSQL migration with RLS, member-scoped reads, admin bootstrap path, and audit triggers.
- Subsequent financial modules, member workflows, receipts, and reports remain to be implemented before production use.
