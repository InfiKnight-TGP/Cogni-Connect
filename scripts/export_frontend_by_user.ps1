# export_frontend_by_user.ps1
# Exports the frontend source code partitioned by user role: Caregiver, Self-Care, and Patient.
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$frontendRoot = Join-Path $repoRoot 'frontend'
$exportDir = Join-Path $repoRoot 'docs/export'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $exportDir)) {
  New-Item -ItemType Directory -Force -Path $exportDir | Out-Null
}

function To-Relative([string]$fullPath) {
  $normRoot = $repoRoot.Replace('\', '/').TrimEnd('/') + '/'
  $normPath = (Resolve-Path -LiteralPath $fullPath).Path.Replace('\', '/')
  if ($normPath.StartsWith($normRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $normPath.Substring($normRoot.Length)
  }
  return $normPath
}

function Read-SourceText([string]$fullPath) {
  return [System.IO.File]::ReadAllText($fullPath, $utf8NoBom)
}

function Count-Lines([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return 0 }
  return ($text -split "`r?`n").Count
}

# 1. Page entries per user
$sharedRoots = @(
  'frontend/app/layout.tsx',
  'frontend/app/globals.css',
  'frontend/app/api/backend/[...path]/route.ts',
  'frontend/app/api/accuracy/route.tsx',
  'frontend/app/api/questions/route.tsx'
)

$caregiverPages = @(
  $sharedRoots + @(
    'frontend/app/caregiver/page.tsx',
    'frontend/app/caregiver/alerts/page.tsx',
    'frontend/app/caregiver/log/page.tsx',
    'frontend/app/caregiver/settings/page.tsx',
    'frontend/app/setup/page.tsx',
    'frontend/app/progress/page.tsx',
    'frontend/app/upload/page.tsx',
    'frontend/app/report/page.tsx',
    'frontend/app/routine/page.tsx',
    'frontend/app/games/page.tsx',
    'frontend/app/places/page.tsx',
    'frontend/app/people/page.tsx',
    'frontend/app/explore/page.tsx'
  )
)

$selfPages = @(
  $sharedRoots + @(
    'frontend/app/page.tsx',
    'frontend/app/today/page.tsx',
    'frontend/app/quiz/page.tsx',
    'frontend/app/explore/page.tsx',
    'frontend/app/my-progress/page.tsx',
    'frontend/app/people/page.tsx',
    'frontend/app/places/page.tsx',
    'frontend/app/sos/page.tsx',
    'frontend/app/games/page.tsx',
    'frontend/app/routine/page.tsx',
    'frontend/app/settings/page.tsx',
    'frontend/app/report/page.tsx',
    'frontend/app/upload/page.tsx'
  )
)

$patientPages = @(
  $sharedRoots + @(
    'frontend/app/page.tsx',
    'frontend/app/today/page.tsx',
    'frontend/app/quiz/page.tsx',
    'frontend/app/explore/page.tsx',
    'frontend/app/my-progress/page.tsx',
    'frontend/app/people/page.tsx',
    'frontend/app/places/page.tsx',
    'frontend/app/sos/page.tsx',
    'frontend/app/settings/page.tsx'
  )
)

# 2. Transitive Import Resolver
function Resolve-ImportPath([string]$fromFile, [string]$specifier) {
  $dir = Split-Path -Parent $fromFile
  $targetBase = $null

  if ($specifier.StartsWith('@/')) {
    $targetBase = Join-Path $frontendRoot $specifier.Substring(2)
  } elseif ($specifier.StartsWith('./') -or $specifier.StartsWith('../')) {
    $targetBase = Join-Path $dir $specifier
  } else {
    return @{ Kind = 'external'; Specifier = $specifier }
  }

  $candidates = @(
    $targetBase,
    "$targetBase.tsx",
    "$targetBase.ts",
    "$targetBase.mjs",
    "$targetBase.css",
    "$targetBase.md",
    (Join-Path $targetBase "index.tsx"),
    (Join-Path $targetBase "index.ts"),
    (Join-Path $targetBase "index.mjs")
  )

  foreach ($cand in $candidates) {
    if (Test-Path -LiteralPath $cand -PathType Leaf) {
      $resolved = (Resolve-Path -LiteralPath $cand).Path
      return @{ Kind = 'local'; Path = $resolved }
    }
  }

  return @{ Kind = 'unresolved'; Specifier = $specifier; From = $fromFile }
}

$importRegexes = @(
  '(?m)^[ \t]*import\s+[^''"]*?from\s*[''"]([^''"]+)[''"]',
  '(?m)^[ \t]*export\s+[^''"]*?from\s*[''"]([^''"]+)[''"]',
  '(?m)^[ \t]*import\s*[''"]([^''"]+)[''"]',
  'import\s*\(\s*[''"]([^''"]+)[''"]\s*\)',
  '@import\s+[''"]([^''"]+)[''"]'
)

function Collect-UserFiles([string[]]$entryPaths) {
  $visited = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $queue = [System.Collections.Generic.Queue[string]]::new()
  $skippedJson = @{}
  $skippedLarge = @{}
  $externalPackages = [System.Collections.Generic.SortedSet[string]]::new()
  $unresolvedImports = [System.Collections.Generic.SortedSet[string]]::new()

  foreach ($rel in $entryPaths) {
    $full = Join-Path $repoRoot $rel
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $resolved = (Resolve-Path -LiteralPath $full).Path
      if ($visited.Add($resolved)) {
        $queue.Enqueue($resolved)
      }
    }
  }

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $content = Read-SourceText $current

    # Parse imports
    foreach ($pattern in $importRegexes) {
      $matches = [regex]::Matches($content, $pattern)
      foreach ($m in $matches) {
        $specifier = $m.Groups[1].Value
        if ([string]::IsNullOrWhiteSpace($specifier)) { continue }

        $res = Resolve-ImportPath $current $specifier
        if ($res.Kind -eq 'external') {
          [void]$externalPackages.Add($res.Specifier)
        } elseif ($res.Kind -eq 'unresolved') {
          [void]$unresolvedImports.Add("$($res.Specifier) (from $(To-Relative $res.From))")
        } elseif ($res.Kind -eq 'local') {
          $candPath = $res.Path
          $candRel = To-Relative $candPath
          $item = Get-Item -LiteralPath $candPath

          if ($candPath -match '\.json$') {
            $skippedJson[$candRel] = $item.Length
            continue
          }
          if ($item.Length -gt 300KB) {
            $skippedLarge[$candRel] = $item.Length
            continue
          }
          if ($candRel -match '^(node_modules|\.next|out|public|\.git)[\\/]') {
            continue
          }

          if ($visited.Add($candPath)) {
            $queue.Enqueue($candPath)
          }
        }
      }
    }
  }

  # Ensure locale and game JSON data files are recorded in skippedJson
  $localesDir = Join-Path $frontendRoot 'lib/interaction/locales'
  if (Test-Path -LiteralPath $localesDir) {
    foreach ($jf in (Get-ChildItem -LiteralPath $localesDir -Filter "*.json")) {
      $skippedJson[(To-Relative $jf.FullName)] = $jf.Length
    }
  }
  $gamesDir = Join-Path $frontendRoot 'components/games'
  if (Test-Path -LiteralPath $gamesDir) {
    foreach ($jf in (Get-ChildItem -LiteralPath $gamesDir -Recurse -Filter "*.json")) {
      $skippedJson[(To-Relative $jf.FullName)] = $jf.Length
    }
  }

  # Ensure all files in all registered game directories are included
  $gamesDir = Join-Path $frontendRoot 'components/games'
  if (Test-Path -LiteralPath $gamesDir) {
    $gameDirs = Get-ChildItem -LiteralPath $gamesDir -Directory | Where-Object { $_.Name -ne '_shared' -and $_.Name -ne 'node_modules' }
    foreach ($gDir in $gameDirs) {
      $gFiles = Get-ChildItem -LiteralPath $gDir.FullName -Recurse -File | Where-Object {
        $_.Extension -in @('.ts', '.tsx', '.css', '.mjs', '.md') -and $_.Length -le 300KB
      }
      foreach ($gf in $gFiles) {
        $resolved = (Resolve-Path -LiteralPath $gf.FullName).Path
        [void]$visited.Add($resolved)
      }
    }
  }

  return @{
    Files = @($visited)
    SkippedJson = $skippedJson
    SkippedLarge = $skippedLarge
    External = @($externalPackages)
    Unresolved = @($unresolvedImports)
  }
}

# 3. Secret Scanner
$secretPatterns = @(
  @{ Name = "sk- prefix"; Regex = 'sk-[a-zA-Z0-9_\-]{20,}' },
  @{ Name = "api key assignment"; Regex = '(?i)api[_-]?key\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,}["'']' },
  @{ Name = "password assignment"; Regex = '(?i)password\s*[:=]\s*["''][^"'']+["'']' },
  @{ Name = "token assignment"; Regex = '(?i)token\s*[:=]\s*["''][^"'']+["'']' },
  @{ Name = "BEGIN PRIVATE KEY"; Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
  @{ Name = "OPENAI_API_KEY"; Regex = '(?i)OPENAI_API_KEY\s*[:=]\s*["'']' }
)

# Known false positives allowlist (file relative path, line number, pattern name)
$knownAllowlist = @(
  @{ File = "frontend/lib/auth.check.mjs"; Line = 79; Pattern = "password assignment" } # Test mock password
)

function Scan-FileForSecrets([string]$filePath) {
  $rel = To-Relative $filePath
  $lines = [System.IO.File]::ReadAllLines($filePath, $utf8NoBom)
  $findings = @()

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    foreach ($p in $secretPatterns) {
      if ($line -match $p.Regex) {
        # Check allowlist
        $allowed = $false
        foreach ($al in $knownAllowlist) {
          if ($al.File -eq $rel -and $al.Line -eq $lineNum -and $al.Pattern -eq $p.Name) {
            $allowed = $true
            break
          }
        }
        $findings += [PSCustomObject]@{
          File = $rel
          Line = $lineNum
          Pattern = $p.Name
          Allowed = $allowed
        }
      }
    }
  }
  return $findings
}

# 4. Generate user export
function Build-UserExport(
  [string]$userName,
  [string]$outputFile,
  [string[]]$entryPages,
  [bool]$isPatient = $false
) {
  Write-Host "Analyzing files for $userName..."
  $collected = Collect-UserFiles $entryPages
  $allFiles = @($collected.Files)

  # Scan for secrets
  $violations = @()
  foreach ($f in $allFiles) {
    $findings = Scan-FileForSecrets $f
    foreach ($finding in $findings) {
      if (-not $finding.Allowed) {
        $violations += $finding
      } else {
        Write-Host "  [Allowlisted false positive] $($finding.File):$($finding.Line) ($($finding.Pattern))"
      }
    }
  }

  if ($violations.Count -gt 0) {
    Write-Error "Secret pattern matched! Halting output generation."
    foreach ($v in $violations) {
      Write-Host "SECRET MATCH: $($v.File):$($v.Line) pattern: $($v.Pattern)"
    }
    throw "Aborted due to secret pattern match."
  }

  # Prepare file blocks sorted alphabetically by relative path
  $fileObjects = @()
  foreach ($f in $allFiles) {
    $rel = To-Relative $f
    $content = Read-SourceText $f
    $lines = Count-Lines $content
    $fileObjects += [PSCustomObject]@{
      Relative = $rel
      FullPath = $f
      Content = $content
      Lines = $lines
    }
  }
  $fileObjects = $fileObjects | Sort-Object -Property Relative

  $totalFiles = $fileObjects.Count
  $totalLines = ($fileObjects | Measure-Object -Property Lines -Sum).Sum
  $dateStr = (Get-Date).ToString("yyyy-MM-dd")

  # Build header
  $headerLines = [System.Collections.Generic.List[string]]::new()
  $headerLines.Add("USER: $userName")
  $headerLines.Add("DATE: $dateStr")
  $headerLines.Add("FILES COUNT: $totalFiles")
  $headerLines.Add("TOTAL LINES: $totalLines")
  $headerLines.Add("GAMES: All registered games are included.")

  if ($isPatient) {
    $headerLines.Add("SHARED EDIT PAGES (READ-ONLY AT RUNTIME):")
    $headerLines.Add("  - frontend/app/places/page.tsx: canEditPlaces(session?.role) is false for patient_device")
    $headerLines.Add("  - frontend/app/people/page.tsx: canEditPeople(session, Boolean(caregiver)) is false for patient_device")
    $headerLines.Add("  - frontend/app/explore/page.tsx: canManageMemories(session) is false for patient_device")
  }

  $headerLines.Add("")
  $headerLines.Add("SKIPPED JSON DATA FILES:")
  if ($collected.SkippedJson.Count -eq 0) {
    $headerLines.Add("  (none)")
  } else {
    foreach ($k in ($collected.SkippedJson.Keys | Sort-Object)) {
      $headerLines.Add("  - $k ($($collected.SkippedJson[$k]) bytes)")
    }
  }

  $headerLines.Add("")
  $headerLines.Add("SKIPPED LARGE FILES (> 300 KB):")
  if ($collected.SkippedLarge.Count -eq 0) {
    $headerLines.Add("  (none)")
  } else {
    foreach ($k in ($collected.SkippedLarge.Keys | Sort-Object)) {
      $headerLines.Add("  - $k ($($collected.SkippedLarge[$k]) bytes)")
    }
  }

  $headerLines.Add("")
  $headerLines.Add("EXTERNAL DEPENDENCIES:")
  $headerLines.Add("  " + (($collected.External -join ", ")))

  $headerLines.Add("")
  $headerLines.Add("UNRESOLVED IMPORTS:")
  if ($collected.Unresolved.Count -eq 0) {
    $headerLines.Add("  (none)")
  } else {
    foreach ($u in $collected.Unresolved) {
      $headerLines.Add("  - $u")
    }
  }

  $headerLines.Add("")
  $headerLines.Add("FILE LIST:")
  foreach ($fo in $fileObjects) {
    $headerLines.Add("  $($fo.Relative) ($($fo.Lines) lines)")
  }
  $headerLines.Add("")

  # Combine header and file blocks
  $outputBody = [System.Collections.Generic.List[string]]::new()
  $outputBody.Add(($headerLines -join "`n"))

  foreach ($fo in $fileObjects) {
    $outputBody.Add("=== FILE: $($fo.Relative) ===")
    $outputBody.Add($fo.Content.TrimEnd())
    $outputBody.Add("")
  }

  $finalText = $outputBody -join "`n"
  [System.IO.File]::WriteAllText($outputFile, $finalText, $utf8NoBom)

  # Verify no BOM
  $bytes = [System.IO.File]::ReadAllBytes($outputFile)
  $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  if ($hasBom) {
    throw "Encoding verification failed: $outputFile starts with UTF-8 BOM!"
  }

  $fileSize = (Get-Item -LiteralPath $outputFile).Length
  return [PSCustomObject]@{
    User = $userName
    Files = $totalFiles
    Lines = $totalLines
    SizeBytes = $fileSize
    SizeKB = [math]::Round($fileSize / 1KB, 2)
  }
}

# Run exports
$summary = @()
$summary += Build-UserExport "Caregiver" (Join-Path $exportDir "frontend_caregiver.txt") $caregiverPages $false
$summary += Build-UserExport "Self-Care" (Join-Path $exportDir "frontend_self.txt") $selfPages $false
$summary += Build-UserExport "Patient" (Join-Path $exportDir "frontend_patient.txt") $patientPages $true

Write-Host "`n=== EXPORT SUMMARY ==="
$summary | Format-Table -Property User, Files, Lines, @{ Name = "Size (KB)"; Expression = { $_.SizeKB } }
