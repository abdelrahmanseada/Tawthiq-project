# Current state — Bremer single-company build

Written after reading `D:\Bremer-old` at commit `c49c013`. This is the baseline before the Bremer pass.

## What exists

- Next.js 15 App Router, React 19, strict TypeScript, Tailwind, Prisma/PostgreSQL, Auth.js v5 beta, pdf-lib, sharp, ExcelJS, BullMQ optional.
- Working admin login, forced password change, TOTP 2FA and recovery codes, sessions, RBAC, audit/scan logs, employees, photo upload/crop, imports, card PDF/A4/ZIP, public `/v/[token]`, reports, settings, administrators, system status.
- `Card.token_enc` already exists and imports/seeds store it. The card layout already lives in one `lib/card/layout.ts` consumed by PDF and `CardPreview`.
- CSRF origin validation already follows an allow-list (`lib/http.ts`) and smoke tests exist. Time zones use `Intl` (`lib/timezone.ts`). Colour validation/fallback and per-field errors already exist in settings.
- English is the only enabled locale; Arabic files, shaping and fonts are dormant. The Latin-only validator and import row errors exist.
- Public verification page has no-store/noindex/CSP, rate limits, hashed IPs and scan logging.

## What is wrong or missing for this brief

1. **Multi-company platform is present and must be removed.** Schema has `PLATFORM_ADMIN`, `Company.custom_domain`, `PlatformAuditLog`; there are `/platform` pages, a platform service, platform seed accounts and platform branching in auth/scope. The brief explicitly forbids all of it.
2. **Brand is “Tawthiq” everywhere.** `lib/brand.ts`, messages, login, shell, metadata, PDF/Excel metadata, README and tests. Seed creates “Northwind Demo” and “Contoso Demo”, not Bremer.
3. **Dark mode exists and is defaulting from the OS.** `html.dark` and `prefers-color-scheme: dark` rules, theme cookie/toggle and `dark:` utilities. The public verification page can render dark on phones.
4. **Company fields missing:** no `tagline`, `website`, `logo_bg_dark`, `show_verify_host_on_card`; no website/tagline on the card; no dark/light logo plate decision.
5. **Card layout gaps:** back column lacks website/tagline and the verification-address toggle; front has no explicit no-photo silhouette policy beyond existing preview; card tests do not cover all required long/no-logo/no-photo cases or preview parity. QR panel/quiet zone tests exist and pass in the baseline.
6. **Seed is demo-only and multi-company.** No single-company `db:demo` / `db:clear-demo`; no forced 2FA policy env; no owner from env for Bremer.
7. **Deployment folder absent.** No production Compose with `cloudflared`, no production env generator, no Cloudflare/backup/update/client-review docs.
8. **Tests are branded for Tawthiq/Northwind** and include a platform E2E spec that must be deleted/replaced.
9. `README.md` describes the multi-company Tawthiq product, not the Bremer single-company system.
10. No build-failing light-theme purity test. English purity test covers active files but still allows the Tawthiq platform text.

## What is already satisfied and should be kept

- Exact CR80 layout in one source, vector QR with error correction Q, quiet zone, print modes/test print.
- Token hashing/encryption, no plaintext tokens, media URLs encrypted, CSP nonces, rate limits, RBAC, audited actions, import rollback, ZIP/formula protections.
- CSRF same-origin allow-list, time-zone validation/searchable select, colour fallback and field summaries.
- 2FA, recovery codes, sessions, lockout, audit log, retention.
- Latin-only server validation and English-only locale switch.

## Plan

1. Consolidate schema to one Bremer company; add new fields; migrate existing data; remove platform enum/table and code.
2. Replace identity with Bremer, light-only tokens, remove theme toggle and dark styles.
3. Finish card fields/logo rules and tests; finish verification light rendering and reasons.
4. Add Bremer seed + demo/clear scripts + REQUIRE_2FA.
5. Add deployment/Cloudflare/backup/client-review files and README.
6. Delete platform tests, update brand/light tests, run every gate, review screenshots and card PNGs.
