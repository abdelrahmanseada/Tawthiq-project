# Deploying Bremer with Cloudflare Tunnel

The app cannot run on Cloudflare Pages or Workers: it needs PostgreSQL, Prisma, Argon2, sharp, local storage, pdf-lib and BullMQ. Run the Docker Compose stack on a Linux VPS (or the owner's PC for a short demo) and publish it with a Cloudflare Tunnel.

## 1. Domain and Cloudflare account

1. Buy or move the domain to Cloudflare.
2. Change the registrar nameservers to the two Cloudflare nameservers shown in the dashboard.
3. Wait until Cloudflare says the zone is active.

## 2. VPS and Docker

Use Ubuntu 22.04/24.04 with at least 2 GB RAM and 20 GB disk.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker "$USER"
# log out and back in after the group change
git clone https://github.com/OWNER/Bremer.git
cd Bremer
npm ci
npm run init-env:prod
```

`npm run init-env:prod` asks for the final HTTPS hostname and writes `.env` with strong random secrets. Save the printed temporary owner password.

## 3. Cloudflare Tunnel

1. Open Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel.
2. Choose **Cloudflared**, name it `bremer`.
3. Copy the token.
4. Put it in `.env`: `TUNNEL_TOKEN=...`.
5. Add a Public Hostname:
   - Subdomain: `app` (or the chosen name)
   - Domain: your domain
   - Service: `http://app:3000`
6. In Cloudflare SSL/TLS set encryption mode to **Full**.
7. Turn **off** Rocket Loader, Auto Minify, Email Address Obfuscation and any HTML-rewriting feature. CSP nonces and server-rendered HTML must pass through unchanged.
8. Add a Cache Rule: **Bypass cache** for `/v/*`, `/api/*` and `/_next/data/*`.

Keep `APP_URL`, `AUTH_URL` and `PUBLIC_BASE_URL` equal to the final `https://app.yourdomain.com` address, then restart:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

`cloudflared` is the only service that talks to the internet. Postgres, Redis and the app have no published ports.

## 4. Migrate and create the owner

```bash
docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --profile seed run --rm seed npm run db:seed
```

Sign in at the public hostname with `SEED_SUPERADMIN_EMAIL` and the generated password. The owner must change the password and enrol an authenticator app before reaching the dashboard.

## 5. Check before printing

Open **System status** and confirm database, Redis, storage, HTTPS, public URL and two-factor are all OK. Use **Test this URL** in Company settings. Print one test card, scan it with a phone on mobile data, and confirm the page is `https://.../v/...` and shows “Verified employee of Bremer”.

## 6. Protect the client-review link (optional)

Cloudflare Access can restrict the dashboard while keeping QR scans public:

1. Zero Trust → Access → Applications → Add a self-hosted application for `app.yourdomain.com`.
2. Add an **Allow** policy for the client's e-mail addresses using one-time PIN.
3. Add a **Bypass** policy for these paths so any phone can scan cards:
   - `/v/*`
   - `/api/verify/*`
   - `/api/media/*`
   - `/_next/static/*`
   - `/api/brand/*`
   - `/api/health`
4. Keep the bypass policies above the allow policy.

Dashboard labels change over time; follow the on-screen labels.

## 7. Short demo from the owner's PC

```bash
cloudflared tunnel --url http://localhost:3000
```

This temporary URL changes on every restart and is only for testing. Never print production cards with it. Set `PUBLIC_BASE_URL`/the company verification URL to the temporary URL for the test, then restore the final HTTPS URL.

## Troubleshooting

- `npm ci` failure: run on Node 22 and npm 10.9.x; do not edit `package-lock.json` by hand.
- 502 from Cloudflare: `docker compose -f docker-compose.prod.yml logs -f app cloudflared`.
- Login loop: check `APP_URL`, `AUTH_URL` and the Cloudflare hostname match exactly, and that SSL mode is Full.
- QR opens a login page: Access is protecting `/v/*`; add the bypass policy.
