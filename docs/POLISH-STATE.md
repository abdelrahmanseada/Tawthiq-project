# Polish state

## What exists

- Next.js 15 App Router, strict TypeScript, Prisma/PostgreSQL, Auth.js v5, Tailwind and pdf-lib.
- Tawthiq is the admin-system brand; Bremer is the client company identity shown only on the public verification page, company settings, card preview and printed cards.
- Existing light-only UI, English-only copy, CSP, CSRF origin checks, RBAC, 2FA/recovery, audit logging, rate limiting, imports, scan logs and Docker Compose.
- `/account` currently shows a read-only profile and all user sessions with the literal label “Device” plus a truncated IP hash.
- Breadcrumbs are computed in `app/(admin)/layout.tsx` from a route table and are passed to `AdminShell`.
- Role labels currently come from `messages/en.json` (`Super administrator`, `Administrator`) while `roleLabel()` already returns `Owner`, `Admin`, `Viewer`.
- Dashboard trends are percentages from `lib/services/dashboard.ts`; zero previous values are reported as 100%.
- The Tawthiq mark is an inline SVG (`LogoMark`) with a 36 px sidebar box; the favicon route supports 32/48/180/192/512 but not 16 and there is no manifest.

## What this pass will touch

- A single breadcrumb helper plus tests; consistent `Owner`/`Admin`/`Viewer` message labels.
- KPI change formatting (none / New / absolute / percentage), server data fields and tests.
- Account sessions: friendly user-agent labels, active-only 30-day filter, no session id/IP display, per-session revoke action.
- Account profile: name edit and authenticated e-mail edit (password + TOTP when enrolled), case-insensitive uniqueness, lockout/rate limit, session revocation, masked audit entries, zod validation and CSRF origin checks.
- One migration adding a case-insensitive unique index on administrator e-mail.
- Logo/favicon/manifest sizing and the user-menu interaction.
- CSS-first, reduced-motion-safe polish for page content, buttons, tables, sidebar, KPI cards, chart, menus/toasts, form errors, card flip, login and verification pages.
- Tests and docs (`POLISH-STATE.md`, `POLISH-REPORT.md`, README notes).

## What this pass will not touch

- Brand text, artwork, colour values or footers. Tawthiq and Bremer stay exactly as they are.
- Card layout/PDF generation, QR/token/verification logic and URLs, imports, scan/audit log logic, deployment files, auth/permission model, seeds, Docker setup or security settings.
- Dark mode, Arabic, external fonts/icons/scripts/CDNs, new dependencies, e-mail delivery, or features outside the requested list.
