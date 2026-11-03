# Tawthiq — employee identity and verification

Tawthiq is the system brand used across the website, login, dashboard, exports and public verification page. Bremer is the client company whose employees are managed here; only the printed card and its preview use Bremer’s logo, name and black/red card palette. Bremer HR adds employees one at a time or from Excel; each employee receives a unique QR code printed on the front of an ID card; photos are optional and the card falls back to initials. Anyone can scan the card with a normal phone camera. The public page shows a green **Verified employee of Bremer** with photo, name and job title, or a neutral amber/red invalid state.

## What is in this build

- Single company data: `Company.name = "Bremer"`, with tagline, website, phone, e-mail, card logo and card colours. Website identity is Tawthiq with teal `#0F766E` and amber `#F59E0B`.
- English-only active UI, cards, XLSX, CSV and PDFs. Arabic remains dormant in `messages/ar.json`, `lib/pdf/arabic.ts` and `assets/dormant/`.
- Light theme only, on every admin, auth and public verification page. `color-scheme: light`.
- Bremer card logo upload with dark-background detection (`logo_bg_dark`); Tawthiq shield favicon/apple icon and system branding.
- Owner/Admin/Viewer RBAC, forced first password change, TOTP 2FA with 10 single-use recovery codes, lockout, sessions, CSP nonces, rate limits, audit and scan logs.
- CR80 85.6 × 54 mm cards from one millimetre layout source shared by PDF and web preview: QR on the front; a full-brand logo/website panel on the back; exact CR80, 3 mm bleed print-shop, A4 8-up duplex sheet, ZIP, test print.
- Vector QR, AES-256-GCM `token_enc`, SHA-256 lookup, short-lived encrypted photo URLs.
- Excel import with row errors, duplicate strategies, photo ZIP, progress and rollback.
- Public verification page with no-store/noindex/CSP, progressive rate limiting, hashed IPs, internal scan reasons, “Report a problem”.
- Settings for identity, logo, colours, contact, verification URL, card validity and retention, with live card and verification previews.
- Encrypted backups and restore scripts.

## Local run on Windows without Docker

Requirements: Node 22 and npm 10.9.x, PostgreSQL 16+.

1. Create a database and user.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `APP_URL=http://localhost:3000`, `AUTH_SECRET`, `TOTP_ENCRYPTION_KEY`, `CARD_TOKEN_KEY`, `IP_HASH_SALT`, `MEDIA_SIGNING_SECRET`, `CRON_SECRET`.
3. Install and start:

```powershell
npm ci
npx prisma migrate deploy
npm run db:seed
npm run db:demo   # optional fake staff for review
npm run dev
```

Open `http://localhost:3000` and sign in with `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` (`owner@bremer.example` / `ChangeMe!2026` in development). The owner must change the password and enrol 2FA (unless `REQUIRE_2FA=false`).

`db:demo` refuses to run in production. `db:clear-demo` removes only `DEMO-*` employees and their cards.

## Phone testing

`npm run dev` binds to `0.0.0.0`. Put the computer and phone on the same Wi-Fi and open `http://<LAN-IP>:3000` from the phone. Windows may ask to allow Node.js on private networks; allow it. Set the verification URL to `http://<LAN-IP>:3000` in Company settings or set `PUBLIC_BASE_URL` for the session. For HTTPS, use a Cloudflare quick tunnel or ngrok and paste the tunnel URL into Company settings. A temporary tunnel URL is only for testing; never print production cards with it.

## Docker (local)

```bash
cp .env.example .env
docker compose build
docker compose up -d postgres redis migrate
docker compose --profile seed run --rm seed
docker compose up -d app worker scheduler
```

Open `http://localhost:3000`. PostgreSQL, Redis and app run on the internal network; use `docker compose logs -f app` for errors.

## Docker storage permissions

The runner entrypoint repairs ownership of the mounted `/app/storage` volume (for restored or pre-existing volumes) and then drops from root to the unprivileged `node` user before starting Next.js. This keeps photo and logo uploads writable without running the application as root.

## Production with Cloudflare Tunnel

The app needs PostgreSQL, Prisma, sharp, Argon2, local storage and PDF rendering; it cannot run on Cloudflare Pages or Workers. The supported model is a small Linux VPS running `docker-compose.prod.yml`, published through a Cloudflare Tunnel (no inbound ports). Read [`deploy/CLOUDFLARE.md`](deploy/CLOUDFLARE.md) for the exact beginner steps, cache rules, SSL mode and optional Cloudflare Access protection.

Production environment:

```bash
npm ci
npm run init-env:prod
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --profile seed run --rm seed npm run db:seed
```

Production defaults: HTTPS-only verification URL, `AUTH_TRUST_HOST=true`, `TRUSTED_PROXY=cloudflare` (uses `CF-Connecting-IP`), 90 MB ZIP cap for Cloudflare's free request limit, secure cookies when `APP_URL` is HTTPS, and mandatory 2FA. Set `TUNNEL_TOKEN` after creating the tunnel. Do not open the app, Postgres or Redis ports in production.

## Verification address and QR

The QR payload is always `{base}/v/{token}`. The base comes from `PUBLIC_BASE_URL` initially and is stored per company in Company settings. Production validation rejects non-HTTPS, localhost, `127.x`, `.local`, private/LAN addresses and non-443 ports. The settings page has **Test this URL** (server health check), a LAN helper, and a persistent warning while the URL is not production-valid. Before changing the URL, the page warns how many active cards use the old one. The QR is on the card front. The back is a brand panel with the company logo, name, tagline and website; the verification host is added there only when **Print the verification address on the card back** is enabled. Employee photos are optional.

## Backups

```powershell
npm run backup
$env:RESTORE_CONFIRM="YES"; npm run restore -- backups/evs-YYYY-MM-DD.evsbak
```

Backups contain a custom-format `pg_dump`, the storage directory and a manifest, zip-compressed then AES-256-GCM encrypted with `BACKUP_PASSPHRASE`. Store the passphrase separately. A daily cron/Task Scheduler entry can run `npm run backup`; verify a restore on a non-production copy first.

## Profile changes and motion

The signed-in administrator can edit their own name and e-mail on **My account**. A name change takes effect immediately. Changing the e-mail requires the current password and, when the account has two-factor authentication enabled, a current authenticator code. There is no mail provider: nothing is sent, and the new address is used the next time the user signs in. Other sessions are revoked; the current session stays signed in. E-mail uniqueness is case-insensitive, changes are rate-limited and failed password/code attempts follow the normal account lockout. Audit entries contain masked addresses only.

The interface is light-only and English-only. Motion is CSS-first (transform/opacity, 120/180/280 ms, staggered reveals) and is disabled by `prefers-reduced-motion: reduce`; content is fully visible with JavaScript disabled on the public verification page.

## Tests

```powershell
npm run typecheck
npm run lint
npm run test:unit
$env:TEST_DATABASE_URL="postgresql://evs:evs@127.0.0.1:55432/evs_bremer_test?schema=public"
npm run test:integration
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
```

The E2E suite uses `E2E_BASE_URL` (default `http://127.0.0.1:3000`) and provisions its own SUPER_ADMIN on the Bremer company. It does not create a second company.

## Verified gates (this pass)

- `npm run typecheck` — pass.
- `npm run lint` — pass, zero warnings.
- `npm run test:unit` — 146 tests / 19 files passed.
- `npm run test:integration` — 21 tests / 5 files passed.
- `npm run test:e2e` — 17 Playwright tests passed (light 1440/390, axe, English/brand purity, settings, 2FA challenge, verification, import rollback).
- `npm run build` — pass.
- Clean Docker `npm ci` and production `runner` image build — pass.
- `npm audit --omit=dev` — 9 moderate, 0 high/critical.

## Security notes

Hashed card lookups, AES-256-GCM token recovery/rendering, encrypted TOTP secrets, HMAC-hashed IPs, server-side RBAC on every page/action/route, lockout, audit logging, CSP nonces, origin checks, upload magic-byte validation and re-encoding, ZIP-slip/bomb protection, spreadsheet formula neutralisation and retention. Photo URLs are encrypted and short-lived. Employee photos are optional for printing; existing photos are re-encoded and stripped of metadata. Production cookies are secure because `APP_URL` is HTTPS. The QR API never returns employee data for invalid tokens. 2FA is enforced by default; System status warns when it is disabled.

## Screenshots

- `screenshots/tawthiq/login.png` — Tawthiq system login.
- `screenshots/tawthiq/dashboard.png` — Tawthiq dashboard.
- `screenshots/bremer/settings.png` — Bremer card settings and live previews.
- `screenshots/bremer/card-preview.png` — Bremer card preview.
- `screenshots/tawthiq/verify-invalid.png` — Tawthiq public verification shell.
- `test-output/bremer/page-0.png` / `page-1.png` — rendered PDF front/back (reviewed for clipping/overlap).

## Known limitations

- The uploaded logo should be square or have enough padding; the card places it in a contain box (8 mm on the front, 28 mm on the back).
- The public page deliberately does not reveal whether a card was suspended, terminated or revoked. Admins see the internal reason in the scan log.
- Cloudflare deployment files are provided but were not deployed from this environment; no claim of a live deployment is made.
- `npm audit` reports moderate findings in development tooling; see the final report for the current runtime audit.
