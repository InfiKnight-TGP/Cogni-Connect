# Local production-browser test workflow

Use PowerShell from the repository root. The development server and `next start`
both use `frontend/.next`. Do not run `npm run build` while any Next.js process
for this frontend is reading that directory.

## Before a build

Inspect listeners and their owning processes before choosing a port or building:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -in 3000,3001,3002,5031 |
  ForEach-Object {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    [pscustomobject]@{ Port=$_.LocalPort; Pid=$_.OwningProcess; Command=$p.CommandLine }
  }
```

If a frontend dev or production server is using `frontend/.next`, do not rebuild
over it. Confirm the owning process and the session using it before stopping it.
If it may belong to another session, leave it running and ask before taking an
action that interrupts it. Instead, use an isolated temporary copy with its own
dependencies and `.next` directory. Do not junction its `node_modules` back to
the repository on Windows: Next.js tracing can resolve that as an invalid drive
path.

```powershell
$reviewFrontend = Join-Path $env:TEMP ('CogniConnect-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reviewFrontend | Out-Null
robocopy D:\Python-EPJ\voice-ai-journal-platform\frontend $reviewFrontend /E /XD node_modules .next test-results
if ($LASTEXITCODE -gt 7) { throw "robocopy failed: $LASTEXITCODE" }
Set-Location $reviewFrontend
npm ci
npm run build
```

This copy uses the repository's committed lockfile and keeps generated build
files, static assets, and browser-test output separate from the live app.

## Build and serve

When the repository's `.next` directory is not in use, you can build there
directly. Otherwise, build the isolated copy above. Start the production server
from the same frontend directory that contains that build, on a verified free
port:

```powershell
Set-Location D:\Python-EPJ\voice-ai-journal-platform\frontend
npm run build
Get-NetTCPConnection -State Listen -LocalPort 3011 -ErrorAction SilentlyContinue
npm run start -- --hostname 127.0.0.1 --port 3011
```

An empty listener query means port 3011 was free when checked. If it is occupied,
choose another free port. Keep the server running while browser checks execute;
do not rebuild `.next` until that server has been safely stopped.

In a second frontend terminal, run the main browser suite against that server.
The support suite independently starts its disposable Flask API on port 5031, so
confirm that port is free before running it:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3011'
npm run test:e2e
Get-NetTCPConnection -State Listen -LocalPort 5031 -ErrorAction SilentlyContinue
npm run test:e2e:support
```

## Verify the served build

Before relying on browser results, fetch a patient page, check every referenced
Next.js JavaScript chunk, and open critical routes in Chromium. Look for failed
chunk requests and page errors in the browser console. For example, a simple
HTTP check of chunk URLs from the served HTML is:

```powershell
$html = (Invoke-WebRequest 'http://127.0.0.1:3011/support' -UseBasicParsing).Content
$chunks = [regex]::Matches($html, '/_next/static/[^"'' ]+\.js') |
  ForEach-Object Value | Sort-Object -Unique
foreach ($chunk in $chunks) {
  (Invoke-WebRequest "http://127.0.0.1:3011$chunk" -UseBasicParsing).StatusCode
}
```

All chunk requests should return HTTP 200. Also check hydration on `/`, `/play`,
and `/support`; a healthy status code alone does not detect a stale process/build
combination. Do not terminate an occupied listener until its command, project,
and impact are verified.
