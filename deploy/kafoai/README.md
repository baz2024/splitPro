# SplitPro on split.kafoai.com (Docker)

> **Deploying on Vercel instead?** See [`../vercel/README.md`](../vercel/README.md).

This is SplitPro, an expense-splitting app like Splitwise. It is deployed as its own app on a subdomain and linked from the KafoAI sidebar. It supports Arabic: the language picker includes **العربية**, and the whole UI switches to right-to-left with an Arabic font.

## 1. DNS

Add an `A` record: `split.kafoai.com` → your server's public IP.
If you use Cloudflare, set SSL to **Full (strict)**.

## 2. Configure

```bash
cd deploy/kafoai
cp .env.example .env
openssl rand -base64 32   # paste into NEXTAUTH_SECRET
```

Fill in the database password and **at least one sign-in method**. The best option is OIDC with KafoAI's identity provider, so users sign in once.

## 3. Run

```bash
docker compose up -d --build
docker compose logs -f splitpro
```

Caddy gets a TLS certificate automatically. Open https://split.kafoai.com.

If KafoAI already runs nginx, remove the `caddy` service and use:

```nginx
server {
  server_name split.kafoai.com;
  listen 443 ssl;   # plus your certificate lines
  location / {
    proxy_pass http://127.0.0.1:3000;   # publish port 3000 on the splitpro service
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## 4. Add to the KafoAI sidebar

Add one item to the sidebar's nav config. In React it looks something like this:

```tsx
import { Wallet } from 'lucide-react';

{ label: t('sidebar.splitpro'), // en: "Split Expenses", ar: "تقسيم المصاريف"
  href: `https://split.kafoai.com/${locale === 'ar' ? 'ar' : 'en'}/balances`,
  icon: Wallet,
  external: true }
```

Putting the locale in the path (`/ar/...`) opens SplitPro in the same language the user has in KafoAI.

## Arabic / RTL: what changed

- New `ar` locale in `public/locales/ar/*` and `next-i18next.config.js`
- `<html dir="rtl" lang="ar">` set server-side (`src/pages/_document.tsx`) and kept in sync on client-side language changes (`src/pages/_app.tsx`)
- Noto Sans Arabic font when the locale is Arabic
- Physical Tailwind classes (`ml-/mr-/text-left/right-…`) replaced with logical ones (`ms-/me-/text-start/end-…`). Back and forward arrows flip in RTL.
