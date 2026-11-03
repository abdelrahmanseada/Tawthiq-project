# Card and photo update

## Fixed uploads

**Employee photo “Something went wrong”** was a storage-permission failure, not an image failure:

```text
EACCES: permission denied, mkdir '/app/storage/photos/<company-id>'
```

The named Docker volume was owned by `root`, while the app intentionally ran as `node`. I repaired the existing volume ownership and added `docker-entrypoint.sh`. The runner now:

1. starts as root only long enough to `chown -R node:node /app/storage`,
2. drops to `node` with `gosu`,
3. starts Next.js as UID/GID 1000.

Verified in the running Docker container: `/proc/1/status` reports UID/GID 1000; employee upload returns `?saved=1` and writes `photos/<company>/<uuid>.jpg` as `node`.

**Company logo not showing after save** had the same write failure, plus stale image caching. The media URL was cache-busted with `logo_url` (which does not change because the file path is reused). It now uses `Company.updated_at` on the employee form, card selector and settings page. Upload/save/restore was tested end-to-end; the card preview received a new `v=` timestamp and the file was written as `node:node`.

The settings uploader accepts **PNG, JPG and SVG**; SVG is rasterised server-side before the standard PNG normalisation and storage path.

## Optional photos

- `checkCardPrintability` no longer requires a photo.
- The card selector no longer blocks selected employees without photos.
- The employee card page no longer lists “Add a photo before printing” as a blocker.
- Front-card preview and PDF use a clean initials panel when no photo exists.
- Copy now says “No photo (optional)” and explains that the card uses initials.
- Verified: a photo-less employee downloads in normal CR80 mode and test mode, and uploads still work.

## Card design

The single layout source (`lib/card/layout.ts`) now defines:

- **Front:** company header/logo, employee photo or initials, name/title/department, large QR panel with “Scan to verify”, ID code and expiry.
- **Back:** full company-colour brand panel, large contained company logo (white plate only when needed), company name, tagline and website; optional verification host when the existing setting is enabled.

Both `lib/pdf/card.ts` and `components/CardPreview.tsx` consume the new geometry. QR generation moved from the back to the front; the back contains no QR or employee data. The existing card layout unit tests, QR decode tests, PDF tests and English/brand purity test were updated for the intentional design and placement changes.

Verified with the live tunnel URL:

```text
decoded https://interpretation-reveal-standing-circus.trycloudflare.com/v/Zx7Q...
```

The QR uses a 4-module quiet zone and at least 0.45 mm modules for the current 98-character verification URL.

## Tests

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test:unit`: **146 passed / 19 files**
- `npm run test:integration`: **21 passed / 5 files**
- `npm run test:e2e`: **17 passed** (includes edit-page photo removal)
- `npm run build`: pass
- Docker app image: built and running as `node`
- Docker employee photo upload: `?saved=1`
- Docker normal CR80 no-photo ZIP: downloaded, no blocker
- Playwright edit-page Remove photo → Save clears `photo_path`
- Docker logo upload/save/restore: `?saved=1`, updated cache-busting timestamp
- Front/back PDFs rendered and reviewed: `test-output/bremer-final/page-0.png`, `page-1.png`
- `npm audit --omit=dev`: 9 moderate, 0 high/critical

## Files changed

- `lib/card/layout.ts` — new front/back geometry and data.
- `lib/pdf/card.ts` — front QR, initials placeholder, brand back panel and back logo.
- `components/CardPreview.tsx` — matching web preview.
- `lib/services/cards.ts` — photo no longer blocks printing.
- `components/CardsSelector.tsx` — remove photo blocker; pass website/tagline; cache-bust logo.
- `app/(admin)/employees/[id]/page.tsx` — remove photo blocker; pass brand fields.
- `app/(admin)/employees/employee-form.tsx` — cache-bust logo with `updated_at`.
- `app/(admin)/settings/settings-form.tsx` — PNG/JPG accept; cache-bust preview already uses updated timestamp.
- `messages/en.json` — optional-photo copy and back-format wording.
- `Dockerfile`, `docker-entrypoint.sh` — storage ownership repair and privilege drop.
- `README.md` — card/photo/storage notes.
- `tests/unit/card-layout.test.ts`, `tests/unit/pdf-qr.test.ts`, `tests/unit/english-purity.test.ts`, `tests/unit/card-security.test.ts`, `tests/e2e/verification.spec.ts` — updated for the intended design/photo policy.
- `test-output/bremer-final/` — rendered proof files.
- `screenshots/card-preview-front-final.png`, `card-preview-back-final.png` — browser review shots.
