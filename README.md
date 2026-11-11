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

## Delivery status

- Built: Bengali responsive foundation, brand icon, installable PWA manifest, Supabase Auth login, admin/member route separation, member-scoped dashboard, real-data financial overview, charts, member register, monthly savings, annual fees, share issue, and balanced income/expense ledger posting.
- Prepared: PostgreSQL migration with row-level security, member-only reads, admin bootstrap, immutable audit table access, and server-side balanced ledger posting.
- Still required before operational use: apply and verify the migration in the named Supabase project; set the project URL and public client key in local/GitHub environment; create the administrator and link member accounts; build the remaining investment, Qard, funds, constitution, settings, reports, receipt/PDF, backups, and complete RLS tests.

The dashboard intentionally displays no fabricated totals. Until Supabase configuration is present, the app shows a setup notice. Do not use the first deployment to record production finance until migrations, administrator roles, and Auth/member links have been verified.
