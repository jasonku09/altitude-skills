# Runs one REAL `codex exec` turn on Windows with this checkout's Altitude
# plugin installed from a local marketplace, so Codex itself launches every
# hook through the session shell. No secrets: the model is the local stand-in
# (mock-responses-server.mjs) and the altitude CLI runs unpaired.
#
# Writes its evidence to -OutDir; check-real-codex.mjs decides pass/fail:
#   codex-output.txt      everything `codex exec` printed ("hook: X Completed")
#   codex-exit.txt        its exit code
#   hook-tap.jsonl        one record per node process under a hook (hook-tap.cjs)
#   diagnostics-new.ndjson altitude CLI diagnostics records written by this run
#   mock.out              the requests the stand-in model server received
param(
  [Parameter(Mandatory)] [string] $Repo,
  # The user profile to run as: hooks, CODEX_HOME and the altitude home all
  # live under it, so a profile path with a space puts a space in PLUGIN_ROOT.
  [Parameter(Mandatory)] [string] $ProfileDir,
  # The npm global prefix holding this profile's altitude CLI (put first on PATH).
  [Parameter(Mandatory)] [string] $NpmDir,
  [Parameter(Mandatory)] [string] $OutDir,
  [int] $Port = 8765,
  # A model slug Codex has metadata for, so it offers the apply_patch tool the
  # stand-in server calls (see mock-responses-server.mjs). Never contacted.
  [string] $Model = 'gpt-5.5'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Marketplace source = a copy of this checkout, minus everything that is not
# the plugin. `codex plugin add` installs from it like a learner's install.
$mkt = Join-Path $env:RUNNER_TEMP 'codex-hooks-marketplace'
if (Test-Path $mkt) { Remove-Item -Recurse -Force $mkt }
robocopy $Repo $mkt /E /XD .git .github ci node_modules test /NFL /NDL /NJH /NJS /NP | Out-Null
Write-Host "commandWindows (SessionStart):"
Select-String -Path (Join-Path $mkt 'hooks\codex.json') -Pattern 'commandWindows' | Select-Object -First 1 | ForEach-Object { Write-Host "  $($_.Line.Trim())" }

$codexHome = Join-Path $ProfileDir '.codex'
$project = Join-Path $ProfileDir 'projects\my-app'
New-Item -ItemType Directory -Force -Path $codexHome, $project | Out-Null
$tapLog = Join-Path $OutDir 'hook-tap.jsonl'
if (Test-Path $tapLog) { Remove-Item $tapLog }

# The env Codex is launched with is the env every hook gets.
$env:PATH = (@($NpmDir) + ($env:PATH -split ';' | Where-Object { $_ })) -join ';'
$env:CODEX_HOME = $codexHome
if ($ProfileDir -ne $env:USERPROFILE) {
  $env:USERPROFILE = $ProfileDir
  $env:HOMEDRIVE = $ProfileDir.Substring(0, 2)
  $env:HOMEPATH = $ProfileDir.Substring(2)
  $env:APPDATA = Join-Path $ProfileDir 'AppData\Roaming'
  $env:LOCALAPPDATA = Join-Path $ProfileDir 'AppData\Local'
}

Write-Host "== where altitude / node / codex"
where.exe altitude 2>&1 | Write-Host
where.exe node 2>&1 | Write-Host
where.exe codex 2>&1 | Write-Host
Write-Host "codex: $(codex --version 2>&1)"

Write-Host "== install the plugin from the local marketplace into CODEX_HOME=$codexHome"
codex plugin marketplace add $mkt 2>&1 | Write-Host
codex plugin add altitude@altitude 2>&1 | Write-Host
Get-ChildItem -Recurse -Depth 3 (Join-Path $codexHome 'plugins\cache') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.FullName)" }

$mockOut = Join-Path $OutDir 'mock.out'
$server = Start-Process -FilePath node -ArgumentList @("`"$(Join-Path $here 'mock-responses-server.mjs')`"", $Port) -PassThru -NoNewWindow -RedirectStandardOutput $mockOut -RedirectStandardError (Join-Path $OutDir 'mock.err')
$deadline = (Get-Date).AddSeconds(15)
while (-not ((Test-Path $mockOut) -and (Select-String -Path $mockOut -Pattern 'mock responses server on' -Quiet))) {
  if ((Get-Date) -gt $deadline) { throw "the stand-in model server did not start: $(Get-Content -Raw (Join-Path $OutDir 'mock.err') -ErrorAction SilentlyContinue)" }
  Start-Sleep -Milliseconds 200
}

$env:MOCK_KEY = 'not-a-secret'
$env:ALTITUDE_HOOK_TAP_LOG = $tapLog
$diag = Join-Path $env:USERPROFILE '.altitude\diagnostics.ndjson'
$diagBefore = if (Test-Path $diag) { @(Get-Content $diag).Count } else { 0 }
# NODE_OPTIONS treats `\` inside quotes as an escape: quote a /-separated path.
$env:NODE_OPTIONS = "--require `"$((Join-Path $here 'hook-tap.cjs') -replace '\\', '/')`""
Push-Location -LiteralPath $project
try {
  Write-Host "== codex exec (cwd=$project)"
  # --dangerously-bypass-hook-trust: plugin hooks need a one-time trust review
  # in the TUI before Codex runs them; there is no TUI here (see README).
  $out = codex exec --dangerously-bypass-hook-trust --skip-git-repo-check `
    -c model_provider=mock -c 'model_providers.mock.name="mock"' `
    -c "model_providers.mock.base_url=`"http://127.0.0.1:$Port/v1`"" `
    -c 'model_providers.mock.wire_api="responses"' -c 'model_providers.mock.env_key="MOCK_KEY"' `
    -c 'model_providers.mock.request_max_retries=0' -c 'model_providers.mock.stream_max_retries=0' `
    -m $Model 'say hi' 2>&1 | Out-String
  $codexExit = $LASTEXITCODE
} finally {
  Pop-Location
  $env:NODE_OPTIONS = $null
  $env:ALTITUDE_HOOK_TAP_LOG = $null
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
Write-Host $out
Write-Host "codex exec exit=$codexExit"
Set-Content -Path (Join-Path $OutDir 'codex-output.txt') -Value $out -Encoding utf8
Set-Content -Path (Join-Path $OutDir 'codex-exit.txt') -Value "$codexExit" -Encoding utf8
$newDiag = if (Test-Path $diag) { @(Get-Content $diag | Select-Object -Skip $diagBefore) } else { @() }
Set-Content -Path (Join-Path $OutDir 'diagnostics-new.ndjson') -Value ($newDiag -join "`n") -Encoding utf8
if (-not (Test-Path $tapLog)) { New-Item -ItemType File -Path $tapLog | Out-Null }
