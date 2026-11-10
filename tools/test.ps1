# Headless test run: starts the local server, loads the unit tests and the
# end-to-end smoke test (tests/smoke.html) in headless Edge,
# prints the results, and exits non-zero on failure.
#   pwsh tools/test.ps1
param([int]$Port = 8099)

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Edge or Chrome not found'; exit 2 }

$server = Start-Process pwsh -ArgumentList '-NoProfile', '-File', (Join-Path $PSScriptRoot 'serve.ps1'), '-Port', $Port -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Milliseconds 800
  $failed = $false
  foreach ($page in @("tests/", "tests/smoke.html")) {
    $profileDir = Join-Path ([System.IO.Path]::GetTempPath()) "dartnight-test-$Port"
    $dom = & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profileDir" --virtual-time-budget=30000 --dump-dom "http://localhost:$Port/$page" 2>$null | Out-String
    $text = [regex]::Match($dom, '(?s)<pre id="results">(.*?)</pre>').Groups[1].Value
    Write-Output "== $page =="
    Write-Output ([System.Net.WebUtility]::HtmlDecode($text))
    if ($dom -notmatch 'data-status="pass"') { $failed = $true }
  }
  if ($failed) { exit 1 } else { exit 0 }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
