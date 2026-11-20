#!/usr/bin/env bash
# Generates the production .env for the Bremer stack using only openssl.
#
# Mirrors scripts/init-env-prod.ts, which requires Node; a fresh server often has
# nothing but Docker. Keep the two in sync if the variable list changes.
#
# Usage:  ./deploy/gen-env.sh https://verify.bremer-eg.com [--force]
set -euo pipefail

APP_URL="${1:-}"
FORCE="${2:-}"

if [[ -z "$APP_URL" ]]; then
  echo "usage: $0 https://your.host.name [--force]" >&2
  exit 1
fi

APP_URL="${APP_URL%/}"
if [[ "$APP_URL" != https://* ]]; then
  echo "APP_URL must start with https://" >&2
  exit 1
fi

HOST="${APP_URL#https://}"
HOST="${HOST%%/*}"
HOST_LEN=${#HOST}
if (( HOST_LEN > 31 )); then
  echo "warning: host is ${HOST_LEN} characters; the card QR needs 31 or fewer." >&2
fi

if [[ -f .env && "$FORCE" != "--force" ]]; then
  echo ".env already exists. Re-run with --force only if you intend to replace it." >&2
  exit 1
fi

# base64url without padding, which is what the app decodes.
rand_b64url() {
  openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'
}

AUTH_SECRET="$(rand_b64url 48)"
POSTGRES_PASSWORD="$(rand_b64url 24)"
TOTP_ENCRYPTION_KEY="$(rand_b64url 32)"
CARD_TOKEN_KEY="$(rand_b64url 48)"
IP_HASH_SALT="$(rand_b64url 24)"
MEDIA_SIGNING_SECRET="$(rand_b64url 32)"
CRON_SECRET="$(rand_b64url 32)"
BACKUP_PASSPHRASE="$(rand_b64url 32)"
OWNER_PASSWORD="Br3mer-$(rand_b64url 9)"

umask 077
cat > .env <<EOF
# Bremer production environment - generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
NODE_ENV=production
PORT=3000

# One hostname serves both the admin UI and the public verification page.
APP_URL=${APP_URL}
AUTH_URL=${APP_URL}
PUBLIC_BASE_URL=${APP_URL}
PUBLIC_VERIFY_URL=${APP_URL}
ALLOWED_ORIGINS=${APP_URL}

AUTH_SECRET=${AUTH_SECRET}
AUTH_TRUST_HOST=true
TRUSTED_PROXY=proxy
TRUSTED_PROXY_HOPS=1

DATABASE_URL=postgresql://evs:${POSTGRES_PASSWORD}@postgres:5432/evs?schema=public
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

TOTP_ENCRYPTION_KEY=${TOTP_ENCRYPTION_KEY}
CARD_TOKEN_KEY=${CARD_TOKEN_KEY}
IP_HASH_SALT=${IP_HASH_SALT}
MEDIA_SIGNING_SECRET=${MEDIA_SIGNING_SECRET}
MEDIA_URL_TTL=300
CRON_SECRET=${CRON_SECRET}

STORAGE_DIR=/app/storage
MAX_SPREADSHEET_BYTES=10485760
MAX_ZIP_BYTES=94371840
MAX_IMAGE_BYTES=5242880
MAX_IMPORT_ROWS=5000

REDIS_URL=redis://redis:6379
BULLMQ_ENABLED=true

REQUIRE_2FA=true
ALLOW_NO_2FA=false
COPYRIGHT_TEXT=© {year} Bremer

SEED_COMPANY_PHONE=+20 100 000 0000
SEED_COMPANY_EMAIL=hr@bremer.example
SEED_SUPERADMIN_EMAIL=owner@bremer.example
SEED_SUPERADMIN_PASSWORD=${OWNER_PASSWORD}

BACKUP_PASSPHRASE=${BACKUP_PASSPHRASE}
BACKUP_DIR=./backups
PG_DUMP_PATH=pg_dump
PG_RESTORE_PATH=pg_restore

TUNNEL_TOKEN=
EOF

chmod 600 .env
echo ".env written with fresh secrets (mode 600)."
echo "Owner: owner@bremer.example"
echo "Temporary owner password: ${OWNER_PASSWORD}"
echo "Store that password now; it is not printed again."
