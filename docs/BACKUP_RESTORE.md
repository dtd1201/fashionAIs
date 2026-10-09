# PostgreSQL Backup and Restore

PostgreSQL is authoritative for identity, organizations, assets, generation
state, billing reconciliation, and the credit ledger. Redis and R2 are not
database backups.

## Backup

Create a private backup directory and use a UTC timestamp:

```bash
install -d -m 700 backups
backup_file="backups/fashionais-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9' >"$backup_file"
chmod 600 "$backup_file"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  pg_restore --list <"$backup_file" >/dev/null
```

Take a verified backup immediately before every migration. Copy backups to
encrypted off-host storage; a file on the same VPS is not disaster recovery.
Example retention is 14 daily, 8 weekly, and 12 monthly backups. Current-stage
targets should be RPO <= 24 hours and RTO <= 4 hours; reduce RPO with managed
PITR or more frequent backups as traffic grows.

## Restore drill

Restore only into a clean, isolated database. Never automate destructive
production replacement:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" fashion_ais_restore'
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d fashion_ais_restore --clean --if-exists --no-owner' \
  < backups/fashionais-YYYYMMDDTHHMMSSZ.dump
```

Point a temporary API/Prisma command at the restored database and verify:

```sql
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;
SELECT count(*) AS users FROM "User";
SELECT count(*) AS organizations FROM "Organization";
SELECT count(*) AS generations FROM "Generation";
SELECT count(*) AS ledger_entries FROM "CreditLedgerEntry";
SELECT count(*) AS balance_mismatches
FROM "OrganizationCreditBalance" b
WHERE b.balance <> COALESCE((
  SELECT SUM(e.amount) FROM "CreditLedgerEntry" e
  WHERE e."organizationId" = b."organizationId"
), 0);
```

`balance_mismatches` must be zero. Also run `npx prisma migrate status` against
the restored database and perform authenticated read-only application checks.
Complete and time a restore drill before public launch and at least quarterly.
