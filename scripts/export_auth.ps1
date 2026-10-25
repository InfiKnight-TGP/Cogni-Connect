$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$output = Join-Path $root "docs\auth_export.txt"
$files = [System.Collections.Generic.List[string]]::new()

function Add-RelativeFile([string]$relative) {
  $full = Join-Path $root $relative
  if (Test-Path -LiteralPath $full -PathType Leaf) { $files.Add($relative) }
}

@(
  "backend/auth.py", "backend/db.py", "backend/schema.sql", "backend/mailer.py", "backend/.env.example",
  "frontend/lib/api.ts", "frontend/lib/auth-context.tsx", "frontend/lib/auth-session.ts", "frontend/lib/mode.ts", "frontend/lib/nav.tsx",
  "frontend/components/nav.tsx", "frontend/components/caregiver.tsx", "frontend/app/layout.tsx"
) | ForEach-Object { Add-RelativeFile $_ }

foreach ($directory in @("backend/tests", "frontend/components/auth")) {
  $fullDirectory = Join-Path $root $directory
  if (Test-Path -LiteralPath $fullDirectory) {
    Get-ChildItem -LiteralPath $fullDirectory -Recurse -File |
      Where-Object { $_.Name -notlike ".env*" -and $_.Name -ne "auth.db" -and $_.Extension -in ".py", ".ts", ".tsx" -and $_.FullName -notmatch "[\\/]__pycache__[\\/]" -and ($directory -ne "backend/tests" -or $_.Name -like "*auth*.py" -or $_.Name -eq "test_self_accounts.py") } |
      ForEach-Object { $files.Add($_.FullName.Substring($root.Length + 1).Replace('\', '/')) }
  }
}

foreach ($directory in @("frontend/app/welcome", "frontend/app/login", "frontend/app/signup", "frontend/app/verify", "frontend/app/forgot", "frontend/app/reset", "frontend/app/pair", "frontend/app/setup", "frontend/app/insights", "frontend/app/settings", "frontend/app/caregiver")) {
  $fullDirectory = Join-Path $root $directory
  if (Test-Path -LiteralPath $fullDirectory) {
    Get-ChildItem -LiteralPath $fullDirectory -Recurse -File | Where-Object { $_.Extension -in ".ts", ".tsx" } | ForEach-Object { $files.Add($_.FullName.Substring($root.Length + 1).Replace('\', '/')) }
  }
}

Get-ChildItem -LiteralPath (Join-Path $root "frontend") -Recurse -File -Filter "*navFor*" -ErrorAction SilentlyContinue |
  ForEach-Object { $files.Add($_.FullName.Substring($root.Length + 1).Replace('\', '/')) }

$unique = $files | Sort-Object -Unique
$parent = Split-Path -Parent $output
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($relative in $unique) {
  if ($relative -match '(^|/)(\.env$|\.env\.local$|auth\.db$)') { continue }
  $lines.Add("=== FILE: $relative ===")
  $content = Get-Content -LiteralPath (Join-Path $root $relative) -Raw -Encoding UTF8
  $lines.Add($content.TrimEnd("`r", "`n"))
  $lines.Add("")
}
$lines | Out-File -LiteralPath $output -Encoding UTF8
$size = (Get-Item -LiteralPath $output).Length
Write-Output ("Exported {0} files, {1} bytes to {2}" -f $unique.Count, $size, $output)
