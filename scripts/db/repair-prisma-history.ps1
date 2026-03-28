param(
  [switch]$Apply,
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$schemaPath = Join-Path $repoRoot 'prisma\schema.prisma'
$inspectSqlPath = Join-Path $repoRoot 'scripts\db\sql\000_inspect_prisma_state.sql'
$checksumFixSqlPath = Join-Path $repoRoot 'scripts\db\sql\001_fix_checksum_20260226141828.sql'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

function Invoke-PrismaDbExecute {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  & pnpm exec prisma db execute --schema $schemaPath --file $FilePath
}

Set-Location $repoRoot

Write-Host "Repository root: $repoRoot"
Write-Host "Schema: $schemaPath"

if (-not $Apply) {
  Write-Host ""
  Write-Host "Dry run only. No database changes will be made." -ForegroundColor Yellow
  Write-Host "Run with: .\scripts\db\repair-prisma-history.ps1 -Apply"
  Write-Host ""
  Write-Host "Planned steps:"
  Write-Host "1. Inspect Prisma migration state"
  Write-Host "2. Fix checksum for migration 20260226141828"
  if (-not $SkipDeploy) {
    Write-Host "3. Run prisma migrate deploy"
    Write-Host "4. Run prisma generate"
    Write-Host "5. Run prisma migrate status"
  }
  exit 0
}

Write-Host ""
Write-Host "IMPORTANT: run this only after taking a database backup." -ForegroundColor Yellow
Write-Host "Target migration checksum fix: 20260226141828 -> e5f8431897904de511f98f53b81ba618714120136104d5ff3f5245af40ac0416" -ForegroundColor Yellow

Invoke-Step -Label 'Inspect current Prisma state (before repair)' -Action {
  Invoke-PrismaDbExecute -FilePath $inspectSqlPath
}

Invoke-Step -Label 'Fix checksum for migration 20260226141828' -Action {
  Invoke-PrismaDbExecute -FilePath $checksumFixSqlPath
}

Invoke-Step -Label 'Inspect current Prisma state (after checksum repair)' -Action {
  Invoke-PrismaDbExecute -FilePath $inspectSqlPath
}

if (-not $SkipDeploy) {
  Invoke-Step -Label 'Apply pending Prisma migrations' -Action {
    & pnpm run prisma:deploy
  }

  Invoke-Step -Label 'Regenerate Prisma Client' -Action {
    & pnpm run prisma:generate
  }

  Invoke-Step -Label 'Show Prisma migration status' -Action {
    & pnpm exec prisma migrate status --schema $schemaPath
  }
}

Write-Host ""
Write-Host "Repair flow complete." -ForegroundColor Green
