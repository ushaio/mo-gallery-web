# Prisma Repair Runbook

## Purpose

This runbook repairs the Prisma migration history mismatch around:

- `20260226141828`
- previously modified `20260321113000_add_ai_conversations`
- the later drift alignment migrations already added to this repo

## Files

- PowerShell runner:
  - `scripts/db/repair-prisma-history.ps1`
- SQL inspection:
  - `scripts/db/sql/000_inspect_prisma_state.sql`
- SQL checksum repair:
  - `scripts/db/sql/001_fix_checksum_20260226141828.sql`

## Safety notes

- Take a database backup before running the repair flow.
- Test on a local clone of the production database before touching a user-facing environment.
- Do not run `prisma migrate reset` on a database with user data.

## Usage

Dry run:

```powershell
.\scripts\db\repair-prisma-history.ps1
```

Apply repair and then deploy pending migrations:

```powershell
.\scripts\db\repair-prisma-history.ps1 -Apply
```

Apply checksum repair only:

```powershell
.\scripts\db\repair-prisma-history.ps1 -Apply -SkipDeploy
```

## What the script does

1. Inspects `_prisma_migrations`
2. Updates the checksum for migration `20260226141828`
3. Re-checks migration state
4. Runs `pnpm run prisma:deploy`
5. Runs `pnpm run prisma:generate`
6. Prints `prisma migrate status`

## Expected follow-up

After a successful run:

- `Photo.originFlag` should exist
- `Story.storyDate` should be aligned with the current schema
- Prisma migration history should be usable again for future deploys
