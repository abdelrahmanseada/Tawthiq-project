# Requirement map â€” English multi-tenant rework

Status legend: **Met** (implemented and exercised), **Partial** (implemented with a stated caveat), **Unmet** (not done; reason given).

## 1. Observed issues

| Issue | Implementation | Status |
|---|---|---|
| Arabic everywhere | English-only active locale, seed, UI, PDF/Excel, fonts; dormant Arabic assets only | Met |
| No product identity / single company shown as product | `lib/brand.ts`, `components/AdminShell.tsx`, root metadata, product-only login | Met |
| Broken card layout / preview vs PDF / localhost | `lib/card/layout.ts`, `lib/pdf/card.ts`, `components/CardPreview.tsx`, `lib/qr.ts` | Met |
| Empty chart axis / machine copy | `components/ScanChart.tsx` empty state; `messages/en.json` nav/card copy | Met |
| Docker `npm ci` lock drift | npm 10 lock, pinned Docker npm, clean `npm ci` earlier; CI workflow | Partial (Docker not run here) |

## 2. Fixed decisions

| Point | Files | Status |
|---|---|---|
| English only; `ENABLED_LOCALES=['en']`; dormant Arabic | `lib/config.ts`, `lib/locale.ts`, `i18n/request.ts`, `lib/i18n.ts`, `messages/ar.json`, `assets/dormant/fonts` | Met |
| Latin-only names/company/import | `lib/validation/schemas.ts`, `lib/excel/validate.ts`, `lib/config.ts` | Met |
| Product brand constants | `lib/brand.ts`; product uses in `AdminShell`, layout, login, PDF, verify | Met |
| English dates/time zone | `lib/format.ts`, `Company.time_zone`, card/verify/dashboard detail calls | Partial (some list screens default Cairo) |
| Inter only, self-hosted | `lib/web-fonts.ts`, `lib/fonts.ts`, `assets/fonts`, `lib/pdf/assets.ts` | Met |

## 3. Multi-company

| Point | Files | Status |
|---|---|---|
| PLATFORM_ADMIN, nullable company | `prisma/schema.prisma`, `lib/auth/rbac.ts`, `lib/auth/session.ts` | Met |
| Platform console/table/create/suspend/limits/reset/deactivate/audit | `app/platform/**`, `lib/services/platform.ts`, `prisma` PlatformAuditLog | Met |
| Platform dashboard counters | `app/platform/page.tsx`, `lib/services/platform.ts` | Met |
| Tenant isolation one layer | `lib/services/*` companyId boundary, `lib/tenant/scope.ts`, IDOR/tenant tests | Partial (no Prisma extension; see README gap) |
| Storage namespaced by company | `lib/storage.ts` + employee/logo/import key callers | Met |
| `(company_id, employee_code)` unique | `prisma/schema.prisma` existing unique | Met |
| max_employees create/restore/import | `lib/services/employees.ts`, `lib/services/imports.ts` | Met (preview counts rows only at processing; no separate capacity banner) |
| IDOR tests every id route/action | `tests/integration/rbac.test.ts`, `tests/e2e/platform.spec.ts`, existing security tests | Partial (core services, not literally every route) |
| Workspace identity sidebar/title/login | `components/AdminShell.tsx`, `app/layout.tsx`, `app/login/page.tsx` | Met |
| Onboarding wizard/checklist | `app/(admin)/onboarding/**`, dashboard checklist, change-password redirect | Met |
| Verify tenant from token, neutral unknown, custom host, footer | `lib/services/verification.ts`, `app/v/[token]/page.tsx`, report page | Met |
| Self-signup absent | No signup route; platform creation only; README | Met |

## 4. English rework

| Point | Files | Status |
|---|---|---|
| No selector / no Arabic detection / constant `en` | `lib/config.ts`, `i18n/request.ts`, `app/layout.tsx` | Met |
| Drop `Company.locale`, single `name`, migration | migration `20261101130000_multi_tenant_english`, schema | Met |
| Natural copy / nav groups / Front-Back | `messages/en.json`, `AdminShell`, `CardPreview` | Met |
| Two demo companies + platform admin; reset guard | `prisma/seed.ts` | Met |
| English Excel/CSV/import | `lib/excel/**`, `lib/services/export.ts`, `samples/` | Met |
| English-only purity build test | `tests/unit/english-purity.test.ts`, `tests/e2e/english-only.spec.ts` | Met (E2E renders pages; unit checks source/PDF/XLSX) |

## 5. Design polish

| Point | Files | Status |
|---|---|---|
| Hierarchy/page headers/tables/light-dark | design system + rewritten pages; screenshots | Met |
| Chart empty state + data table | `components/ScanChart.tsx` | Met |
| No clipping/truncation/tooltips/LTR | `AdminShell`, tables, `CardPreview`, messages | Met (visual review) |
| Employee Card tab centered/max 520 + actions | `app/(admin)/employees/[id]/page.tsx` | Met |
| Platform indigo accent | `app/platform/layout.tsx` | Met |

## 6. Card

| Point | Files | Status |
|---|---|---|
| Single layout source mm | `lib/card/layout.ts` | Met |
| Front geometry/logo/photo/text/footer | layout + `lib/pdf/card.ts` | Met |
| Back geometry/QR/column/footer | layout + PDF | Met |
| Test print red band/tiled pattern | PDF renderer | Met |
| Print blocking rules | `lib/services/cards.ts`, UI | Met |
| Token storage/reissue | schema/services/crypto | Met |
| Geometry tests | `tests/unit/card-layout.test.ts` (21 cases) | Met |
| QR decode all modes | `tests/unit/pdf-qr.test.ts` | Met |
| Preview/PDF parity | shared layout; visual check | Partial (no automated pixel diff) |

## 7. Verification URL

| Point | Files | Status |
|---|---|---|
| Single payload source | `lib/qr.ts`, company setting | Met |
| Production validation | `validateVerifyBaseUrl`, save/print/company service | Met |
| LAN helper/tunnel/Firewall | `app/api/admin/network/route.ts`, settings form, `npm run dev -H 0.0.0.0`, README | Met |
| Banner/attention/status/test URL | admin layout, dashboard, status, settings action | Met |
| Domain-change affected count | company service, settings UI | Met |

## 8. Security

Hashed tokens/IPs, AES secrets, CSP nonces, rate limits, RBAC, lockout, audit, upload/ZIP defense, formula neutralization, retention, no CDN remain. Platform audit + tenant rate keys added. **2FA/recovery enforcement is disabled** per the immediate prior owner instruction (see README gap).

## 9. Build/run

| Point | Status |
|---|---|
| Docker lock/CI clean install | Lock fixed with npm 10; CI workflow; Docker images built and app/worker running |
| Windows Node+PostgreSQL commands | README |
| `.env.example` platform/URL/card/scripts/proxy | Updated |
| README multi-tenant/card/URL/backups | Updated |

## 10. Quality gates (actual run)

- Typecheck: pass.
- Lint: pass.
- Unit: **121 passed**.
- Integration: **19 passed**.
- E2E: **13 passed**.
- Build: pass.
- `npm audit --omit=dev --audit-level=high`: pass; 9 moderate.
- axe serious/critical: zero on tested pages.
- Docker: images built, migration applied, demo reseeded, app/worker healthy.
- Performance: not measured in this pass.
- Screenshots: `screenshots/v2` 29 images reviewed.

## 11â€“13. Deliverables / constraints

Code, migration, seed, README, `.env.example`, English samples, screenshots. No active Arabic or bilingual UI; no URL/token on card front; test pattern does not overlay text/QR; no external CDN. Known unmet items are listed in README: 2FA, full Prisma-extension scoping, exhaustive IDOR coverage, per-company time zone everywhere, Docker/backup/performance execution.
