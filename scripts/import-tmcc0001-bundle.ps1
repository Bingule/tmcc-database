$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Bundle = Join-Path $Root 'cluster_calculations\Nb2S2C-Pbar3m1\downloaded_from_metacentrum\website_bundle\TMCC-0001'

if (-not (Test-Path -LiteralPath $Bundle)) {
  $FallbackBundle = Join-Path $Root 'cluster_calculations\Nb2S2C-Pbar3m1\downloaded_from_metacentrum\Nb2S2C-Pbar3m1'
  if (Test-Path -LiteralPath (Join-Path $FallbackBundle 'material.json')) {
    $Bundle = $FallbackBundle
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $Bundle 'material.json'))) {
  throw "No TMCC-0001 website bundle found under downloaded_from_metacentrum."
}

$MaterialTarget = Join-Path $Root 'data\materials\TMCC-0001.json'
Copy-Item -LiteralPath (Join-Path $Bundle 'material.json') -Destination $MaterialTarget -Force

$StructureSource = Join-Path $Bundle 'structures'
if (Test-Path -LiteralPath $StructureSource) {
  $StructureTarget = Join-Path $Root 'public\structures\TMCC-0001'
  New-Item -ItemType Directory -Force -Path $StructureTarget | Out-Null
  Copy-Item -LiteralPath (Join-Path $StructureSource '*') -Destination $StructureTarget -Force
}

$FigureSource = Join-Path $Bundle 'figures'
if (Test-Path -LiteralPath $FigureSource) {
  $FigureTarget = Join-Path $Root 'public\figures\TMCC-0001'
  New-Item -ItemType Directory -Force -Path $FigureTarget | Out-Null
  Copy-Item -LiteralPath (Join-Path $FigureSource '*') -Destination $FigureTarget -Force
}

Write-Host "Imported TMCC-0001 website bundle from $Bundle"
