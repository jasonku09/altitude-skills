param([string]$Action)
# Preserve the host permission policy when Node or the adapter is unavailable.
try {
  $ErrorActionPreference = 'Stop'
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
  if (-not $env:PLUGIN_ROOT) { throw 'Missing plugin root.' }
  $adapterPath = Join-Path $env:PLUGIN_ROOT 'bin/altitude-copilot-hook.mjs'
  $hookInput = [Console]::In.ReadToEnd()
  $adapterOutput = $hookInput | & $nodeCommand.Source $adapterPath auto $Action
  if ($LASTEXITCODE -ne 0) { throw 'Adapter failed.' }
  $adapterOutput | ForEach-Object { [Console]::Out.WriteLine($_) }
} catch {
  [Console]::Error.WriteLine('Altitude Copilot hook bootstrap unavailable; check the plugin and Node installation.')
  [Console]::Out.WriteLine('{}')
}
exit 0
