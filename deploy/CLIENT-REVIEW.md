# Client review checklist

## Owner, before sending the link

- [ ] Production `.env` has the final `https://` `APP_URL`, `AUTH_URL` and `PUBLIC_BASE_URL`.
- [ ] Cloudflare SSL/TLS mode is Full and HTML-rewriting features are off.
- [ ] `/v/*` and `/api/*` are excluded from cache and from Cloudflare Access protection.
- [ ] System status shows database, Redis, storage, HTTPS, public URL and 2FA OK.
- [ ] Company settings show the Bremer logo, name, tagline, phone, e-mail and website.
- [ ] The public URL test in Company settings succeeds.
- [ ] A test card prints with a photo and the final HTTPS host, not localhost.
- [ ] The test QR is scanned from a phone on mobile data and shows “Verified employee of Bremer”.
- [ ] The client's HR manager has an Owner or Admin account with `must_change_password`.
- [ ] Sample employees cover: active with photo, active without photo, suspended, terminated, expiring soon.
- [ ] A backup exists and `BACKUP_PASSPHRASE` is stored safely.

## Client test steps

1. Open the HTTPS link and sign in with the temporary password.
2. Set a new password and enrol the authenticator app; save the recovery codes.
3. Open **Employees → Add employee**, add a photo and save.
4. Open **ID cards**, select the employee, choose **Test print** or **Card printer**, download the PDF and print it.
5. Scan the QR with a phone camera on mobile data.
6. Confirm the green “Verified employee of Bremer” page shows the photo, name, job title, department and expiry date.
7. Open **Bulk import**, download the English template, import a small file with one bad row and review the row errors.
8. Try **Company settings** changes and confirm the card and verification previews update.
