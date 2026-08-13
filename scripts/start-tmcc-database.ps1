$ErrorActionPreference = 'Stop'

$Root = 'D:\codex_communication\tmcc-database'
$Port = 5173
$Url = "http://127.0.0.1:$Port/"
$Node = 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Vite = Join-Path $Root 'node_modules\vite\bin\vite.js'

function Test-TmccSite {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 5
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if (Test-TmccSite) {
  Write-Host "TMCC local website is already running: $Url"
  exit 0
}

if (-not (Test-Path -LiteralPath $Node)) {
  throw "Node runtime was not found: $Node"
}

if (-not (Test-Path -LiteralPath $Vite)) {
  throw "Vite was not found. Run dependency install before starting: $Vite"
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Node
$psi.WorkingDirectory = $Root
$psi.Arguments = ('"{0}" --host 127.0.0.1 --port {1}' -f $Vite, $Port)
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

[void][System.Diagnostics.Process]::Start($psi)

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 750
  if (Test-TmccSite) {
    Write-Host "TMCC local website started: $Url"
    exit 0
  }
}

throw "TMCC local website did not respond on $Url after startup."
