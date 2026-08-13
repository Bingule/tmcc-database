$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$ClusterRoot = Join-Path $Root 'cluster_calculations'
$BundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$Python = if (Test-Path -LiteralPath $BundledPython) { $BundledPython } else { 'python' }
$Templates = @(
  @{ Folder = 'Nb2S2C-Pbar3m1'; MaterialId = 'TMCC-0001' },
  @{ Folder = 'Nb2S2C-Rbar3m'; MaterialId = 'TMCC-0002' },
  @{ Folder = 'Cu0.5-Nb2S2C-Pbar3m1'; MaterialId = 'TMCC-0009' },
  @{ Folder = 'Fe0.5-Nb2S2C-Rbar3m'; MaterialId = 'TMCC-0010' },
  @{ Folder = 'Nb2CS-P63mmc'; MaterialId = 'TMCC-0011' }
)

foreach ($Template in $Templates) {
  $Folder = $Template.Folder
  $MaterialId = $Template.MaterialId
  $Bundle = Join-Path $ClusterRoot "$Folder\downloaded_from_metacentrum\website_bundle\$MaterialId"
  if (-not (Test-Path -LiteralPath (Join-Path $Bundle 'material.json'))) {
    $LocalBundle = Join-Path $ClusterRoot "$Folder\website_bundle\$MaterialId"
    if (Test-Path -LiteralPath (Join-Path $LocalBundle 'material.json')) {
      $Bundle = $LocalBundle
    }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $Bundle 'material.json'))) {
    Write-Warning "Skipping $MaterialId ($Folder): no website bundle found."
    continue
  }

  Copy-Item -LiteralPath (Join-Path $Bundle 'material.json') -Destination (Join-Path $Root "data\materials\$MaterialId.json") -Force

  $StructureSource = Join-Path $Bundle 'structures'
  if (Test-Path -LiteralPath $StructureSource) {
    $StructureTarget = Join-Path $Root "public\structures\$MaterialId"
    New-Item -ItemType Directory -Force -Path $StructureTarget | Out-Null
    Copy-Item -Path (Join-Path $StructureSource '*') -Destination $StructureTarget -Force
  }

  $FigureSource = Join-Path $Bundle 'figures'
  if (Test-Path -LiteralPath $FigureSource) {
    $FigureTarget = Join-Path $Root "public\figures\$MaterialId"
    New-Item -ItemType Directory -Force -Path $FigureTarget | Out-Null
    Copy-Item -Path (Join-Path $FigureSource '*') -Destination $FigureTarget -Force
  }

  Write-Host "Imported $MaterialId from $Bundle"
}

& $Python "$Root\cluster_calculations\build_five_template_summary_xlsx.py"
& $Python "$Root\cluster_calculations\build_progress_tracker_xlsx.py"
