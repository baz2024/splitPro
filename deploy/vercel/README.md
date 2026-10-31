# Deploy SplitPro to Vercel at split.kafoai.com

SplitPro needs three things besides Vercel itself:

| Need | Use | Why |
| --- | --- | --- |
| PostgreSQL **with `pg_cron`** | Supabase (free tier works) | Recurring expenses are created by `pg_cron` inside the database |
| Receipt file storage | Vercel Blob (private store) | Vercel functions have no persistent disk |
| A sign-in method | KafoAI OIDC, Google, or email | At least one is required |

## 1. Database (Supabase)
1. Create a project at supabase.com and pick a region close to your Vercel region.
2. **Database → Extensions** → enable **pg_cron**.
3. **Connect → Session pooler**: copy the connection string. Vercel needs the pooler because Supabase's direct connection is IPv6-only. Then append `?sslmode=require`:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`

## 2. Vercel project
1. Vercel → **Add New → Project** → import `baz2024/splitPro`.
2. Leave **Root Directory** as the repo root. The framework (Next.js) and build settings come from `vercel.json`.
3. **Production branch:** `main`.
4. **Storage → Create → Blob**: create a **private** store and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically.

## 3. Environment variables (Settings → Environment Variables)
```
DATABASE_URL=<Supabase session pooler URL>
NEXTAUTH_URL=https://split.kafoai.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -base64 32>
DEFAULT_HOMEPAGE=/balances

# Sign-in, configure at least one:
# KafoAI SSO (redirect URI: https://split.kafoai.com/api/auth/callback/kafoai)
OIDC_NAME=KafoAI
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_WELL_KNOWN_URL=
OAUTH_AUTO_REDIRECT=true
# or Google (redirect URI: https://split.kafoai.com/api/auth/callback/google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```
Optional ones (web push, SMTP, bank integrations) are listed in `../kafoai/.env.example`.

Click **Deploy**. Each build runs `prisma migrate deploy` first, so the database schema is created and kept up to date automatically.

## 4. Domain
1. Vercel project → **Settings → Domains** → add `split.kafoai.com`.
2. At your DNS provider, add the record Vercel shows. Usually it's
   `CNAME  split  cname.vercel-dns.com`.
   If kafoai.com's DNS is already on Vercel, this happens automatically.

## 5. KafoAI sidebar link
```
https://split.kafoai.com/ar/balances   (Arabic)
https://split.kafoai.com/en/balances   (English)
```

## Notes
- **Recurring-expense push notifications** are sent by a Vercel Cron job (`/api/cron/recurrence-notifications`). The recurring expenses themselves are always created on time by `pg_cron`. Hobby plans allow only a daily cron, so it is set to daily at 06:00 UTC. On Pro, change the schedule in `vercel.json` to `*/5 * * * *` for near-real-time notifications.
- Receipts are stored in **private** Vercel Blob storage and are only served to signed-in users through `/api/files/...`.
