$ErrorActionPreference = 'Stop'

$target = Join-Path $HOME '.dsh\skills'
$log    = Join-Path $PSScriptRoot 'dedupe-report.json'

function Get-BodyHash([string]$file) {
  $text = [System.IO.File]::ReadAllText($file)
  $idx = $text.IndexOf("`n---", 3)
  if ($text.StartsWith('---') -and $idx -gt 0) {
    $body = $text.Substring($idx + 4)
  } else {
    $body = $text
  }
  $body = ($body -replace "`r`n", "`n").Trim()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '')
}

$dirs = Get-ChildItem $target -Directory -Force | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }
$groups = $dirs | Group-Object { Get-BodyHash (Join-Path $_.FullName 'SKILL.md') }

$removed = [System.Collections.Generic.List[object]]::new()
$kept    = [System.Collections.Generic.List[object]]::new()

foreach ($g in $groups) {
  $names = @($g.Group | ForEach-Object { $_.Name } | Sort-Object { $_.Length }, { $_ })
  $keep = $names[0]
  $kept.Add([pscustomobject]@{ name = $keep; groupSize = $names.Count })
  foreach ($n in ($names | Select-Object -Skip 1)) {
    if ($keep -and $n.EndsWith("-$keep")) {
      Remove-Item -Recurse -Force (Join-Path $target $n)
      $removed.Add([pscustomobject]@{ removed = $n; keptAs = $keep })
    }
  }
}

# Validate what remains
$invalid = [System.Collections.Generic.List[object]]::new()
foreach ($d in (Get-ChildItem $target -Directory -Force)) {
  $md = Join-Path $d.FullName 'SKILL.md'
  if (-not (Test-Path $md)) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no SKILL.md' }); continue }
  $text = [System.IO.File]::ReadAllText($md)
  if (-not $text.StartsWith('---')) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no frontmatter' }); continue }
  $end = $text.IndexOf("`n---", 3)
  $fm = if ($end -gt 0) { $text.Substring(0, $end) } else { '' }
  $nm = [regex]::Match($fm, '(?m)^name:\s*(.+)$')
  $ds = [regex]::Match($fm, '(?m)^description:\s*(.+)$')
  if (-not $nm.Success) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no name' }); continue }
  if (-not $ds.Success) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no description' }); continue }
  $val = $nm.Groups[1].Value.Trim().Trim('''', '"')
  if ($val -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = "bad name '$val'" }) }
}

[pscustomobject]@{
  total     = @(Get-ChildItem $target -Directory -Force).Count
  removed   = $removed
  invalid   = $invalid
} | ConvertTo-Json -Depth 4 | Set-Content -Path $log -Encoding utf8

Write-Output "removed duplicates: $($removed.Count)"
$removed | ForEach-Object { Write-Output ("  - {0} (kept {1})" -f $_.removed, $_.keptAs) }
Write-Output "invalid: $($invalid.Count)"
$invalid | ForEach-Object { Write-Output ("  ! {0}: {1}" -f $_.name, $_.reason) }
Write-Output "total skill dirs now: $(@(Get-ChildItem $target -Directory -Force).Count)"
