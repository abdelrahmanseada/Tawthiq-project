# Tawthiq

**Verified identity for every workforce.**  
A multi-company employee identity and verification platform. Each company gets its own workspace, branding, verification URL and data; the product itself is always Tawthiq.

---

## Current state (what existed before this pass)

The previous build was a working single-company deployment: one company row acted as the product brand, Arabic was the active language, `Company.locale` switched the UI, and the dashboard/card screens had been redesigned. The ID card preview and PDF were separate implementations, so the QR and text layout drifted; production cards could print a `localhost` URL; the seed created one Arabic demo company; and the schema had no platform operator or tenant status/limits. This pass converts it in place to an English-only, multi-company platform with a single card layout source, while keeping the existing authentication, token encryption, imports, audit, exports and PDF pipeline.

---

## What is in the product

- **English-only active UI.** `ENABLED_LOCALES = ['en']` in `lib/config.ts`. Arabic messages, shaping/bidi utilities and fonts remain under `messages/ar.json`, `lib/pdf/arabic.ts` and `assets/dormant/fonts/` but nothing Arabic is imported, bundled or rendered. `messages/en.json` is the only catalog; `<html lang="en" dir="ltr">`.
- **True multi-company tenancy.** Company-scoped roles `SUPER_ADMIN` (shown as **Owner**), `ADMIN`, `VIEWER`, plus global `PLATFORM_ADMIN` with `company_id = NULL`.
- **Platform console** at `/platform` with an indigo operator accent, company table (status, plan, employees, active cards, scans 30 days, created), create company, suspend/reactivate, edit limits/time zone, reset an ownerÃ¢â‚¬â„¢s 2FA and deactivate admins. Every action writes to `PlatformAuditLog`.
- **Workspace identity.** Sidebar top is always the product mark + Tawthiq; directly below is a workspace card with the tenant logo/monogram, company name and role. Browser titles are `Page Ã‚Â· Tawthiq`; login is product-only.
- **Onboarding.** Platform-created owners change their password and land on `/onboarding` (profile, verification URL, first employees, test print). The checklist stays on the dashboard until finished.
- **English-only data entry.** `full_name`, `department`, `job_title` and company `name` accept Latin letters (including accents), digits, spaces and `. , ' - & / ( ) #` only. Zod enforces this on the server; imports flag offending rows as `latin_only`.
- **Employee ID cards.** CR80 85.6 Ãƒâ€” 54 mm landscape, front/back from one millimetre layout spec; exact CR80, 3 mm bleed print-shop, A4 8-up mirrored backs, ZIP, test print.
- **Verification.** Token-resolved tenant branding; unknown/suspended tokens use neutral Tawthiq branding; custom-host mismatch is invalid; no token, code, contact or national ID is exposed.
- **Operations.** Imports, scan/audit logs, analytics, notifications, CSV/XLSX exports, encrypted backups, sessions/idle timeout, rate limits, CSP nonces and audit trails.

---

## Stack

Next.js 15 App Router Ã‚Â· React 19 Ã‚Â· TypeScript strict Ã‚Â· Tailwind CSS 3.4 Ã‚Â· next-intl 4 Ã‚Â· Auth.js v5 beta Ã‚Â· Prisma 6 Ã‚Â· PostgreSQL Ã‚Â· Argon2id Ã‚Â· pdf-lib + fontkit Ã‚Â· qrcode Ã‚Â· jsQR/mupdf (tests) Ã‚Â· sharp Ã‚Â· ExcelJS Ã‚Â· BullMQ/Redis optional Ã‚Â· Playwright + Vitest.

---

## Quick start

### Docker

```bash
cp .env.example .env
# fill secrets (see PowerShell below)
docker compose build
docker compose up -d postgres redis migrate
docker compose --profile seed run --rm seed
docker compose up -d app worker scheduler
```

Open `http://localhost:3000`.

### Windows with Node + PostgreSQL (no Docker)

1. Node.js 20+ (22 LTS recommended), PostgreSQL 16+.
2. Create `evs` database/user, copy `.env.example` Ã¢â€ â€™ `.env`, set `DATABASE_URL` and secrets.
3. `npm install`, `npx prisma migrate deploy`, `npm run db:reset-demo`, `npm run dev`.

`npm run dev` binds to `0.0.0.0` so a phone on the same Wi-Fi can reach the LAN address. Allow Node.js through Windows Firewall on private networks when prompted.

Generate secrets in PowerShell:

```powershell
function New-Secret([int]$bytes = 48) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=')
}
New-Secret 48   # AUTH_SECRET, CARD_TOKEN_KEY, BACKUP_PASSPHRASE
New-Secret 32   # TOTP_ENCRYPTION_KEY (32 bytes), IP_HASH_SALT, MEDIA_SIGNING_SECRET, CRON_SECRET
```

### Demo data

`npm run db:reset-demo` is dev-only and refuses `NODE_ENV=production`. It creates:

| Company | Slug | Employees | Owner |
|---|---|---|---|
| Northwind Demo | `northwind-demo` | 20 (1 suspended, 1 terminated, 3 expiring in 20 days, 1 without photo) | `admin@example.com` / `ChangeMe!2026` |
| Contoso Demo | `contoso-demo` | 5 | `owner@contoso.example` / `Contoso!Demo2026` |

Platform operator: `platform@tawthiq.example` / `ChangeMe!2026` (override with `PLATFORM_ADMIN_*`). Owners must change the password on first sign-in.

**2FA note:** the immediately preceding product decision removed 2FA from sign-in. This build is therefore password-only; the `/login/2fa` screens are not active. TOTP/recovery/session utilities and schema fields remain dormant, and the platform Ã¢â‚¬Å“Reset 2FAÃ¢â‚¬Â action still clears them. Re-enabling 2FA requires restoring the enrollment route and the second step in `startLoginAction` (see Ã¢â‚¬Å“Known gapsÃ¢â‚¬Â).

---

## Multi-tenant model

- `Company` has `slug`, `status` (`ACTIVE`/`SUSPENDED`), `max_employees`, `time_zone`, `custom_domain`, `verify_base_url`, branding and onboarding fields.
- `AdminUser.company_id` is nullable only for `PLATFORM_ADMIN`.
- Suspended companies cannot sign in; their cards verify as `INVALID` with neutral branding.
- Active employee capacity is enforced on create, restore and import. The import loop stops creating rows once the plan limit is reached and reports `employee_limit_reached`.
- Tenant queries are passed a single `companyId` from the session into the service layer (`lib/services/*`); every employee/card/import/log/media/PDF/settings/admin action re-checks it. Cross-tenant tests live in `tests/integration/rbac.test.ts` and the Playwright suites.
- `storage/{company_id}/...` namespaces photos/logos/imports/reports. Card tokens are SHA-256 hashed for lookup and AES-256-GCM encrypted for on-demand rendering; PDFs are never stored.
- Platform audit is separate from tenant audit (`PlatformAuditLog`).

---

## Platform console

`/platform` is available only to `PLATFORM_ADMIN`. It shows total companies/employees/scans/failed logins, recent signups and recent platform actions. Creating a company creates its first owner with a temporary password and `max_employees`/time zone. Operators can suspend/reactivate, change limits, reset 2FA, and deactivate administrators; no impersonation exists. Actions are CSRF-protected by Next.js server actions and audited.

---

## English-only mode / re-enabling Arabic later

The active locale is fixed in `lib/config.ts`:

```ts
export const ENABLED_LOCALES = ["en"] as const;
```

`i18n/request.ts` imports only `messages/en.json`; `lib/i18n.ts` (PDF/Excel/audit) also uses only English; `lib/web-fonts.ts` and `lib/fonts.ts` load Inter only. Arabic shaping (`lib/pdf/arabic.ts`), `messages/ar.json` and IBM Plex/Noto fonts are retained but dormant and not bundled.

To re-enable Arabic you would need to: add `"ar"` to `ENABLED_LOCALES`, restore locale selection (not a company selector unless desired), import the Arabic font from `assets/dormant/fonts`, restore Arabic branches in formatting/PDF/Excel, and reintroduce the language policy. No migration is required for the removed `Company.locale` column because it no longer exists.

---

## Dates, scripts and formatting

Dates are English Gregorian (`1 Nov 2027`, `1 Nov 2027, 14:05`), Western digits, with a per-company IANA `time_zone` (default `Africa/Cairo`). The settings field is a searchable list from `Intl.supportedValuesOf("timeZone")` and is validated with `Intl.DateTimeFormat(undefined, { timeZone }).format()`; invalid values show both a field error and a summary of every failed field. Empty/invalid brand colours fall back to `#0F766E`/`#F59E0B` for the preview and PDF while the form reports the colour error. Card/verify dates use the tenant time zone; some admin list screens still use Cairo where a `company.time_zone` argument was not threaded through (see Known gaps).

---

## Employee ID card specification

`lib/card/layout.ts` is the single source: millimetre coordinates, font sizes, text wrapping/shrinking and line counts for both sides. `lib/pdf/card.ts` converts mm to PDF points; `components/CardPreview.tsx` uses the same layout with CSS container query units (1 mm = 100/85.6 cqw). There is no separate hand-written preview geometry.

**Front:** primary header 0Ã¢â‚¬â€œ12 mm, accent 12Ã¢â‚¬â€œ13 mm; 9 Ãƒâ€” 9 mm white logo box (contain fit, 0.8 mm padding, monogram fallback); company name 9Ã¢â€ â€™7 pt, max 2 lines; photo 4/16, 22 Ãƒâ€” 29 mm rounded, cover crop; text column x30Ã¢â‚¬â€œ81.6, name 12Ã¢â€ â€™9 pt/2 lines, title 8Ã¢â€ â€™7 pt/2 lines, department 7 pt; footer ID and shield + valid-until at y47.5Ã¢â‚¬â€œ50. No URL or token.

**Back:** header 0Ã¢â‚¬â€œ8 mm; QR panel x4/y12, 30 Ãƒâ€” 30 mm; QR x6/y14, 26 Ãƒâ€” 26 mm including a 4-module quiet zone, EC Q, vector modules, minimum 0.45 mm module (rendering is blocked with Ã¢â‚¬Å“Verification URL is too long for a printable QRÃ¢â‚¬Â if it cannot fit); column x38Ã¢â‚¬â€œ81.6; Ã¢â‚¬Å“Scan to verifyÃ¢â‚¬Â, host (wrapped at dots, no truncation), phone, e-mail, return line; Ã¢â‚¬Å“Powered by TawthiqÃ¢â‚¬Â footer.

**Test print:** a red bottom band (y51Ã¢â‚¬â€œ54) Ã¢â‚¬Å“TEST PRINT - NOT VALIDÃ¢â‚¬Â on both sides, plus a 6% tiled Ã¢â‚¬Å“TESTÃ¢â‚¬Â pattern drawn behind content. It never covers text, photo or QR; QR decode is tested.

**Print blocking:** missing photo, revoked/expired card, non-active employee, suspended company, legacy card without `token_enc`, or a verification URL that is not production-valid. Test print allows a dev/LAN URL and a missing photo but still refuses dead cards. Bulk print reports blockers and prints eligible cards.

**Modes:** exact CR80, print-shop 91.6 Ãƒâ€” 60 mm with 3 mm bleed and crop marks, A4 2 Ãƒâ€” 4 with mirrored backs, ZIP. PDF metadata: `ID card - {name}`, author = company, producer = Tawthiq. Ã¢â‚¬Å“Re-issue all cardsÃ¢â‚¬Â remains audited and confirmed.

---

## Verification URL / QR / phones

QR payload is always `{company.verify_base_url}/v/{token}`. `PUBLIC_VERIFY_URL` seeds the first company and is the fallback only for bootstrapping; the company setting is authoritative. Production validation requires HTTPS, a public host, port 443, and rejects localhost/127.x/private/LAN/.local. Development allows `http://<LAN-IP>:3000` and tunnel URLs.

In Company settings, **Use my LAN address** calls an authenticated endpoint that detects the machineÃ¢â‚¬â„¢s IPv4 and fills `http://<ip>:3000`; open that URL on a phone on the same Wi-Fi. For HTTPS use Cloudflare Tunnel or ngrok and paste the tunnel URL. **Test this URL** calls `/api/health` server-side.

Admin card POST routes validate `Origin` against `APP_URL`, `AUTH_URL`, optional `ALLOWED_ORIGINS` (comma-separated) and â€” only when `AUTH_TRUST_HOST=true` â€” the request host/proto. Missing Origin is rejected for POST. Same-origin browser downloads work through `fetch` without exposing JSON in a new tab.

A persistent banner, dashboard attention item and System status check flag non-production URLs. Changing a domain warns how many active cards are affected before saving. A request on one tenantÃ¢â‚¬â„¢s custom host carrying another tenantÃ¢â‚¬â„¢s token returns INVALID; unknown tokens always show neutral Tawthiq branding.

---

## Imports

English-only template/instructions/error report in `samples/employee-import-template-en.xlsx` and `samples/sample-photos-en.zip`. The wizard is spreadsheet Ã¢â€ â€™ preview Ã¢â€ â€™ strategy Ã¢â€ â€™ background processing Ã¢â€ â€™ report/rollback. Latin-only violations are row errors. The plan limit is enforced during processing and reported as `employee_limit_reached`. Duplicate strategy: skip/update/fail.

---

## Backups

`npm run backup` writes an AES-256-GCM `.evsbak` containing a custom-format `pg_dump`, storage and manifest, keyed by `BACKUP_PASSPHRASE` with scrypt. `npm run restore -- <file>` requires `RESTORE_CONFIRM=YES`. Requires PostgreSQL client tools (`pg_dump`/`pg_restore`). Stop the app before restoring.

---

## Tests and quality gates

```powershell
npm run typecheck
npm run lint
npm run test:unit                 # tests/unit
$env:TEST_DATABASE_URL='postgresql://evs:evs@127.0.0.1:55432/evs_test?schema=public'
npm run test:integration
npm run test:e2e                  # Playwright starts dev with E2E_MODE=1
npm run build
npm audit --omit=dev --audit-level=high
```

Actual results from this workspace:

- Typecheck: pass.
- Lint: pass, zero warnings/errors.
- Unit: **121 tests / 15 files**.
  - `card-layout` 21 geometry/long-content/QR-panel tests.
  - PDF metadata, 60-character names/titles, missing images, print-shop size.
  - QR decode for CR80, print-shop, test print and mirrored A4 back (`jsQR` + `mupdf`).
  - English-only source/PDF/XLSX purity.
- Integration: **19 tests / 4 files**, including origin/CSRF policy, RBAC, tenant scoping, `max_employees`, suspended-company neutral INVALID, custom-host mismatch and import rollback.
- Playwright: **13 tests**, including platform create â†’ owner onboarding â†’ suspend, English purity of company/platform/verify pages, cross-tenant IDOR basics, axe serious/critical zero on login/dashboard/employees/verify.
- Build: pass (standalone).
- `npm audit --omit=dev --audit-level=high`: passes; 9 moderate ExcelJS transitive advisories remain, no high/critical.
- Performance: not re-measured in this pass. Do not treat an old number as current.
- Docker is available now: the app, migrate and worker images were rebuilt, the migration was applied, the demo was reseeded inside the Postgres container, and the app/worker are running. The earlier `npm ci` lock failure is fixed.

Screenshots: `screenshots/v2/` (29 light/dark desktop and mobile images), plus card renders in `test-output/cards/`.

---

## Known gaps / honest assumptions

1. **2FA is disabled.** The previous direct instruction removed it; this brief asks to keep it. I left the working password-only login intact rather than re-breaking access. Dormant TOTP/recovery services and schema fields remain; the platform reset button clears them. Restoring forced enrollment would require the old `/login/2fa` flow and a new stage in `app/login/actions.ts`.
2. **One data-access layer is not a Prisma extension.** Tenant scoping is centralized through service functions that take `companyId` from the session; key services/routes are covered by IDOR tests, but there is no compiler-enforced global extension. This is the largest architectural gap.
3. **Cross-tenant tests** cover core employee/card/log/media/settings services and platform suspension; not literally every route/action with an ID.
4. **PDF/web parity** shares the layout module and has geometry tests, but no pixel-diff test; both were visually inspected.
5. **Per-company time zone** is used for cards/verify and key dashboard/employee dates; some admin lists still default to Cairo.
6. **Platform-created owner 2FA** is not forced because 2FA is disabled.
7. Backups and the verify performance p95 were not executed here. Docker was run: images built, migration applied, demo reseeded, app/worker healthy.
8. Arabic assets are retained deliberately dormant; they are not imported by the active build.

---

## Project structure

```
app/(admin)/          tenant workspace, employees, cards, imports, logs, settings, admins, onboarding
app/platform/         platform console (separate indigo layout)
app/login/            product-only password sign-in
app/v/[token]/        public verification + report
app/api/              auth, verify, media, admin exports/cards/import/network
lib/card/layout.ts    single CR80 layout specification
lib/pdf/              PDF card/sheet renderer, Inter-only assets
lib/services/         company-scoped employees, cards, verification, imports, platform, dashboard
lib/tenant/           (see known gap) service-boundary scoping helpers
prisma/               schema, migrations, two-company English seed
tests/                unit, integration, e2e
screenshots/v2/       final English screenshots
```
