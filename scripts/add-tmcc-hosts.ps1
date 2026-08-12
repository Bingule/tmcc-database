$ErrorActionPreference = 'Stop'
$hosts = 'C:\Windows\System32\drivers\etc\hosts'
$entries = @(
  '127.0.0.1 tmcc.database',
  '127.0.0.1 tmcc.local'
)
$marker = 'D:\codex_communication\tmcc-database\.tmcc-hosts-result.txt'
$content = Get-Content -LiteralPath $hosts
$added = @()

foreach ($entry in $entries) {
  $name = ($entry -split '\s+')[-1]
  if ($content -notmatch "^\s*127\.0\.0\.1\s+$([regex]::Escape($name))\s*$") {
    Add-Content -LiteralPath $hosts -Value "`r`n$entry"
    $added += $name
  }
}

if ($added.Count -eq 0) {
  Set-Content -LiteralPath $marker -Value 'tmcc host entries already present'
} else {
  Set-Content -LiteralPath $marker -Value "added $($added -join ', ')"
}
