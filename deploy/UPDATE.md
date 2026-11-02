# Updating Bremer

```bash
cd Bremer
git pull
npm run typecheck
npm run test:unit
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d
```

Take a backup first:

```bash
npm run backup
```

The backup is written to `BACKUP_DIR` and encrypted with `BACKUP_PASSPHRASE`. Test a restore on a non-production copy with:

```bash
RESTORE_CONFIRM=YES npm run restore -- backups/evs-YYYY-MM-DD.evsbak
```

Do not run `db:demo` in production. The demo script refuses to create fake employees when `NODE_ENV=production`.

## Daily backup schedule

Linux cron (02:15 every day):

```cron
15 2 * * * cd /opt/Bremer && /usr/bin/npm run backup >> /var/log/bremer-backup.log 2>&1
```

Windows Task Scheduler: create a daily task with action `C:\Program Files\nodejs\npm.cmd`, arguments `run backup`, and start-in directory `D:\Bremer-old` (use the real checkout path).
