# syntax=docker/dockerfile:1.7
# Multi-stage build for the Employee Verification System.
# Targets: runner (Next.js standalone server), tools (migrations/worker/seed scripts).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Pin the same npm major/minor used to regenerate package-lock.json.
RUN npm install -g npm@10.9.4
# Present for `prisma generate` during dependency installation; replaced at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS builder
# Build-time placeholders only. Real secrets are injected at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV AUTH_SECRET="build-only-auth-secret-build-only-auth-secret"
ENV TOTP_ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
ENV IP_HASH_SALT="build-only-ip-hash-salt-value"
ENV MEDIA_SIGNING_SECRET="build-only-media-signing-secret"
ENV CRON_SECRET="build-only-cron-secret-value"
ENV APP_URL="http://localhost:3000"
ENV DEFAULT_TIME_ZONE="Africa/Cairo"
ENV ALLOWED_SCRIPTS="latin"
ENV PLATFORM_ADMIN_NAME="Platform Operator"
ENV PLATFORM_ADMIN_EMAIL="platform@tawthiq.example"
ENV PUBLIC_VERIFY_URL="https://verify.example.com"
ENV CARD_TOKEN_KEY="build-only-card-token-key-build-only-card-token-key"
ENV TRUSTED_PROXY_HOPS="1"
ENV BACKUP_PASSPHRASE="build-only-backup-passphrase-value"
ENV STORAGE_DIR="/app/storage"
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STORAGE_DIR=/app/storage
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# Full source + dev dependencies for prisma migrate/seed, the BullMQ worker and the
# retention scheduler. Kept separate so the runtime image stays small.
FROM deps AS tools
ENV NODE_ENV=production
COPY . .
RUN npx prisma generate
CMD ["node", "-v"]
