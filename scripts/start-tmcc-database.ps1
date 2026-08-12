$ErrorActionPreference = 'Stop'
$env:CI = 'true'
$env:PATH = 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
Set-Location 'D:\codex_communication\tmcc-database'
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' dev:tmcc
