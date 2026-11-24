$ErrorActionPreference = 'Stop'

$target = Join-Path $HOME '.dsh\skills'
$report = Join-Path $PSScriptRoot 'import-report.json'
$log    = Join-Path $PSScriptRoot 'cleanup-report.json'

$rows = Get-Content $report -Raw | ConvertFrom-Json
$installed = @($rows | Where-Object { $_.status -eq 'installed' })
$onDisk = @(Get-ChildItem $target -Directory -Force | ForEach-Object { $_.Name })

$removed = [System.Collections.Generic.List[object]]::new()

# 1. Drop the Composio/Rube automation catalog: these need the Rube MCP server and
#    would otherwise add ~770 entries to every session's skill catalog.
foreach ($d in (Get-ChildItem $target -Directory -Force)) {
  $row = $installed | Where-Object { $_.skill -eq $d.Name -and $_.pack -eq 'awesome-claude-skills' } | Select-Object -First 1
  if ($row -or $d.Name -like '*-automation') {
    Remove-Item -Recurse -Force $d.FullName
    $removed.Add([pscustomobject]@{ name = $d.Name; reason = 'composio-catalog' })
  }
}

# 2. Collapse "<pack>-<skill>" duplicates left by per-agent copies of the same skill.
foreach ($d in (Get-ChildItem $target -Directory -Force)) {
  foreach ($pack in ($installed.pack | Sort-Object -Unique)) {
    if ($d.Name -like "$pack-*") {
      $base = $d.Name.Substring($pack.Length + 1)
      if ($onDisk -contains $base) {
        $a = Join-Path $d.FullName 'SKILL.md'
        $b = Join-Path $target "$base\SKILL.md"
        if ((Test-Path $a) -and (Test-Path $b)) {
          Remove-Item -Recurse -Force $d.FullName
          $removed.Add([pscustomobject]@{ name = $d.Name; reason = "duplicate of $base" })
          break
        }
      }
    }
  }
}

# 3. Validate what remains.
$invalid = [System.Collections.Generic.List[object]]::new()
foreach ($d in (Get-ChildItem $target -Directory -Force)) {
  $md = Join-Path $d.FullName 'SKILL.md'
  if (-not (Test-Path $md)) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no SKILL.md' }); continue }
  $text = [System.IO.File]::ReadAllText($md)
  if (-not $text.StartsWith('---')) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no frontmatter' }); continue }
  $end = $text.IndexOf("`n---", 3)
  $fm = if ($end -gt 0) { $text.Substring(0, $end) } else { '' }
  if (-not [regex]::IsMatch($fm, '(?m)^name:\s*\S')) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no name' }) ; continue }
  if (-not [regex]::IsMatch($fm, '(?m)^description:\s*\S')) { $invalid.Add([pscustomobject]@{ name = $d.Name; reason = 'no description' }) }
}

$remaining = @(Get-ChildItem $target -Directory -Force | ForEach-Object { $_.Name })
[pscustomobject]@{
  removedCount = $removed.Count
  remaining    = $remaining.Count
  invalid      = $invalid
} | ConvertTo-Json -Depth 4 | Set-Content -Path $log -Encoding utf8

Write-Output "removed: $($removed.Count)"
Write-Output "remaining: $($remaining.Count)"
$remaining | Sort-Object | ForEach-Object { Write-Output "  $_" }
Write-Output "invalid: $($invalid.Count)"
$invalid | ForEach-Object { Write-Output ("  ! {0}: {1}" -f $_.name, $_.reason) }
