# Polish report

## 1. UI defects

| Point | Implementation | Verification |
|---|---|---|
| 1. Breadcrumbs | `lib/navigation.ts` is the single route-to-breadcrumb helper. `components/AdminShell.tsx` resolves it from the real client `usePathname()` (not a stale header), and `app/(admin)/layout.tsx` supplies the translated labels. | `tests/unit/navigation.test.ts` covers every section and account/employee nesting; `tests/e2e/polish.spec.ts` asserts Dashboard / My account and not Employees. |
| 2. Role labels | `messages/en.json` roles are `Owner`, `Admin`, `Viewer`; `lib/auth/rbac.ts` already exposed the same labels. User menu, account badge, administrator table and service errors now use those labels. DB enum untouched. | Unit `roleLabel` test; account and user-menu E2E. |
| 3. KPI deltas | `lib/kpi.ts` returns none/New/absolute/percentage; `DashboardData` carries the previous-window counts; `app/(admin)/dashboard/page.tsx` suppresses the duplicate “vs previous period” hint except for a percentage. | `tests/unit/polish.test.ts` covers 0/0, 0→N, below-10 absolute, and ≥10 percentages. |
| 4. Sessions | `lib/user-agent.ts` turns the UA into a friendly label. `listUserSessions` hides revoked, expired and >30-day inactive rows. `app/(admin)/account/page.tsx` shows UA, current badge, last-active date, no IP hash or session id, and a per-row Revoke. `revokeSessionAction` refuses the current session and checks ownership. | Unit UA labels; integration `tests/integration/profile.test.ts`; account E2E asserts no Device/IP hash and a Revoke action. |
| 5. User menu | `components/UserMenu.tsx` is a button/menu with `top-full`, `z-[70]`, outside-pointer close, Escape close and focus return; state closes on route change. | `tests/e2e/polish.spec.ts` opens, presses Escape and asserts focus on the trigger. |
| 6. Logo and icons | `components/LogoMark.tsx` is a client component with a unique gradient id (the duplicate id clipped the mobile logo), a fixed 36px sidebar box and 20px collapsed state with a title tooltip. `app/api/brand/icon/route.ts` supports 16/32/48/180/192/512; `app/layout.tsx` lists all sizes; `app/manifest.ts` supplies 192/512 manifest icons. Artwork and colours unchanged. | Login mobile screenshot reviewed; Docker favicon route/build smoke-tested. |

## 2. Profile name and e-mail

- `app/(admin)/account/profile-form.tsx`: controlled name/e-mail form, inline field errors, disabled save until dirty, spinner/loading state, success toast, `beforeunload` unsaved guard, password/current 2FA fields shown only when the e-mail changes.
- `app/(admin)/account/actions.ts`: session-owned profile action (no client id), `assertActionOrigin()` CSRF check, zod validation (`profileSchema`), name-only updates without re-auth, password + current TOTP for e-mail changes, case-insensitive uniqueness check, existing lockout counters, 5/15-minute per-user and per-IP rate limits, other-session revocation, current session retained, masked audit metadata.
- `lib/action-origin.ts`: explicit origin check for the new security-sensitive actions.
- `lib/mask.ts`: `a***@gmail.com` masking used in audit metadata.
- `prisma/migrations/20261103090000_admin_email_case_insensitive/migration.sql`: functional unique index on `lower(email)`. It applied to the existing local, test and Docker databases and to the empty test database path.
- No mail provider is used, called or promised. The UI says “No e-mail is sent”, and README documents it.
- Tests: unit validation/masking; integration case-insensitive uniqueness and session filtering/revocation; Playwright name change, wrong-password inline error, e-mail change with password + current TOTP, sign-out and sign-in with the new address.

## 3. Motion and polish

- `app/globals.css`: 120/180/280ms transform/opacity motion, `cubic-bezier(0.2,0,0,1)`, 40ms stagger, page rise/fade, menu/toast entrance, field-error slide, spinner, row hover, active-nav indicator, chart draw, card turn, auth drift, verification entrance, drag-over state. The existing global reduced-motion rule disables animation and transition duration.
- `components/AdminShell.tsx`: page content wrapper keyed by pathname, nav-link indicator, fixed logo box.
- `components/AuthShell.tsx`: slow CSS gradient drift on the brand panel and a form fade-up.
- `components/KpiNumber.tsx`: count-up once; final value is in the DOM and `aria-label`, reduced motion skips animation.
- `components/ScanChart.tsx`: valid line draws in via `pathLength`/CSS.
- `components/CardPreview.tsx`: front/back turn on interaction only; existing card layout source untouched.
- `app/(admin)/loading.tsx`: route-level skeleton while data loads.
- `app/(admin)/imports/import-wizard.tsx`: drag-over highlight for both drop zones.
- `app/(admin)/settings/settings-form.tsx`: save action is in normal flow after the fields (no sticky overlap at 390 or 1440).

### Motion verification

`tests/e2e/motion.spec.ts` runs a reduced-motion context, asserts animation duration is disabled and content is visible, then runs normal motion, waits 650ms, asserts content visible and measures layout shift from navigation start. `tests/e2e/accessibility.spec.ts` runs axe under reduced motion so the scan measures final contrast.

## 4. Real gate output

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, zero warnings |
| `npm run test:unit` | **146 passed / 19 files** |
| `npm run test:integration` | **21 passed / 5 files** |
| `npm run test:e2e` | **17 passed** |
| `npm run build` | pass |
| `npm audit --omit=dev` | 9 moderate, 0 high/critical |
| Clean Docker `npm ci` target | exit 0; Next 15.5.28, Prisma 6.19.3 verified inside image |
| Production runner image | built successfully |
| Docker CSV export | HTTP 200, `text/csv; charset=utf-8` |
| Docker test-print ZIP | `employee-cards.zip`, no download failure |

Screenshots at 1440 and 390 were captured and reviewed in `screenshots/polish/`: login, dashboard, employees, account, settings and verification.

## 5. Not fully met / assumptions

- The card “3D flip” is a CSS transform turn of the existing single card surface, not two separately rendered 3D faces. The card layout source and PDF are unchanged.
- Confirmation dialogs use the existing native `window.confirm`; only the user menu, toast and dropdown entrances are animated.
- The generic skeleton is route-level. It is not a bespoke skeleton for every table, and the reveal is a page fade rather than a true skeleton-to-content crossfade.
- The `.row-new` CSS exists, but no list currently sets it after creation; newly created records open their detail page instead.
- Not every empty list has a call-to-action; existing empty states retain their icon/title.
- The sidebar collapse still animates width (the existing layout behaviour) rather than a transform-only shell.
- Reduced-motion and CLS are tested on dashboard; employees was checked visually at 390/1440, not with a separate CLS budget.
- E-mail-change lockout/rate-limit logic is implemented and wrong-password behaviour is covered E2E; a full five-attempt lockout browser test was not added.
- I did not change Tawthiq/Bremer text, artwork, colours, card/PDF layout, QR/token/verification logic, imports, logs, compose files, seeds, auth model or security settings.

## 6. Files changed outside `app/`, `components/`, `lib/`, `styles/`, `tests/`

- `README.md` — profile/e-mail behaviour, no-mail statement, reduced motion, current test counts.
- `docs/POLISH-STATE.md` — required pre-change note.
- `docs/POLISH-REPORT.md` — this report.
- `messages/en.json` — role labels (`Owner`/`Admin`/`Viewer`), profile form copy, KPI “New”/absolute wording and audit action labels.
- `prisma/migrations/20261103090000_admin_email_case_insensitive/migration.sql` — required section-2 case-insensitive unique index; applies to existing and empty databases.
- `Dockerfile` — the pre-existing full-`node_modules` runtime copy from earlier work remains; this pass restored it after an experiment and did not leave an additional Docker setup change. No compose or `deploy/` changes.
