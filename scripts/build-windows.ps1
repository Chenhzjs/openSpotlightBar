$ErrorActionPreference = "Stop"

param(
  [switch]$SkipVerify
)

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command pnpm
Require-Command cargo

Write-Host "==> Open Spotlight Bar release build (windows)"
Write-Host "Workspace: $Root"

Push-Location $Root
try {
  pnpm install --frozen-lockfile

  if (-not $SkipVerify) {
    Write-Host "==> Running workspace verification"
    pnpm verify
  } else {
    Write-Host "==> Skipping verification because -SkipVerify was provided"
  }

  Write-Host "==> Building Tauri bundle"
  pnpm --dir apps/desktop exec tauri build

  Write-Host "==> Bundles available under apps/desktop/src-tauri/target/release/bundle"
} finally {
  Pop-Location
}
