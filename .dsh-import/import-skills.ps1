$ErrorActionPreference = 'Stop'

$dest   = Join-Path $env:TEMP 'dsh-skill-import'
$target = Join-Path $HOME '.dsh\skills'
$report = Join-Path $PSScriptRoot 'import-report.json'

$repos = @(
  @{ pack = 'superpowers';           url = 'https://github.com/obra/superpowers.git' },
  @{ pack = 'ponytail';              url = 'https://github.com/DietrichGebert/ponytail.git' },
  @{ pack = 'ui-ux-pro-max';         url = 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git' },
  @{ pack = 'graphify';              url = 'https://github.com/Graphify-Labs/graphify.git' },
  @{ pack = 'caveman';               url = 'https://github.com/JuliusBrussee/caveman.git' },
  @{ pack = 'agent-skills';          url = 'https://github.com/addyosmani/agent-skills.git' },
  @{ pack = 'understand-anything';   url = 'https://github.com/Egonex-AI/Understand-Anything.git' },
  @{ pack = 'awesome-claude-skills'; url = 'https://github.com/ComposioHQ/awesome-claude-skills.git' },
  @{ pack = 'archify';               url = 'https://github.com/tt-ali/archify.git' },
  @{ pack = 'impeccable';            url = 'https://github.com/pbakaus/impeccable.git' }
)

$skipSegments = 'node_modules', 'tests', 'test', 'examples', 'example', 'demos', 'demo',
                 'fixtures', 'evals', 'eval', '.github', 'vendor', 'dist', 'build'

function Get-SourceRank([string]$path) {
  if ($path -match '^skills/')                { return 0 }
  if ($path -match '^\.dsh/skills/')          { return 1 }
  if ($path -match '^\.agents/skills/')       { return 2 }
  if ($path -match '^\.agent/skills/')        { return 3 }
  if ($path -match '^\.claude/skills/')       { return 4 }
  if ($path -match '^[^/]+/skills/')          { return 10 }
  return 20
}

function Get-FrontmatterValue([string]$file, [string]$key) {
  $text = [System.IO.File]::ReadAllText($file)
  if (-not $text.StartsWith('---')) { return $null }
  $end = $text.IndexOf("`n---", 3)
  if ($end -lt 0) { return $null }
  $fm = $text.Substring(0, $end)
  $m = [regex]::Match($fm, "(?m)^$key`:\s*['`"]?([^'`"\r\n]+?)['`"]?\s*$")
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value.Trim()
}

function Set-FrontmatterName([string]$file, [string]$newName) {
  $text = [System.IO.File]::ReadAllText($file)
  $end = $text.IndexOf("`n---", 3)
  $head = $text.Substring(0, $end)
  $body = $text.Substring($end)
  $head = [regex]::Replace($head, '(?m)^name:\s*.*$', "name: $newName", 1)
  [System.IO.File]::WriteAllText($file, $head + $body, (New-Object System.Text.UTF8Encoding($false)))
}

# Fresh start: the user skill root did not exist before this import.
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force -Path $dest, $target | Out-Null

$results = [System.Collections.Generic.List[object]]::new()
$claimed = @{}

foreach ($r in $repos) {
  $pack = $r.pack
  $dir  = Join-Path $dest $pack
  try {
    $needClone = -not (Test-Path (Join-Path $dir '.git'))
    if ($needClone) {
      if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
      for ($attempt = 1; $attempt -le 2; $attempt++) {
        $null = git clone --depth 1 --filter=blob:none --no-checkout --quiet $r.url $dir 2>&1
        if ($LASTEXITCODE -eq 0) { break }
        if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
        Start-Sleep -Seconds 3
      }
      if ($LASTEXITCODE -ne 0) {
        $results.Add([pscustomobject]@{ pack = $pack; skill = $null; status = 'clone-failed'; detail = "git exit $LASTEXITCODE" })
        continue
      }
    }

    $paths = @(git -C $dir ls-tree -r --name-only HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or $paths.Count -eq 0) {
      $results.Add([pscustomobject]@{ pack = $pack; skill = $null; status = 'tree-failed'; detail = 'no paths' })
      continue
    }

    $skillFiles = @($paths | Where-Object {
      $_ -match '(^|/)SKILL\.md$' -and
      $_ -notmatch '(^|/)skills/SKILL\.md$' -and
      -not (($_.Split('/') | Where-Object { $skipSegments -contains $_ }).Count -gt 0)
    })

    if ($skillFiles.Count -eq 0) {
      $results.Add([pscustomobject]@{ pack = $pack; skill = $null; status = 'no-skills'; detail = 'no SKILL.md under a skills/ root' })
      continue
    }

    $dirs = @($skillFiles | ForEach-Object {
      $parts = $_.Split('/')
      ($parts[0..($parts.Count - 2)]) -join '/'
    } | Sort-Object -Unique)

    $patterns = $dirs | ForEach-Object { "$_/" }
    $patterns | git -C $dir sparse-checkout set --no-cone --stdin 2>&1 | Out-Null
    $null = git -C $dir read-tree -mu HEAD 2>&1
    if ($LASTEXITCODE -ne 0) { $null = git -C $dir checkout --quiet 2>&1 }

    # Pick one canonical copy per skill name, preferring skills/ then .dsh/skills/.
    $candidates = foreach ($sd in $dirs) {
      $md = Join-Path $dir ((Join-Path $sd 'SKILL.md'))
      if (-not (Test-Path $md)) { continue }
      $nm = Get-FrontmatterValue $md 'name'
      $leaf = Split-Path $sd -Leaf
      $name = if ($nm) { $nm } else { $leaf }
      [pscustomobject]@{
        dir  = $sd
        md   = $md
        name = $name
        rank = (Get-SourceRank $sd)
        len  = $sd.Length
      }
    }

    $chosen = $candidates | Group-Object name | ForEach-Object {
      $_.Group | Sort-Object rank, len | Select-Object -First 1
    }

    foreach ($c in ($chosen | Sort-Object name)) {
      $slug = $c.name
      if ($slug -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
        $results.Add([pscustomobject]@{ pack = $pack; skill = $slug; status = 'invalid-name'; detail = $c.dir })
        continue
      }

      $final = $slug
      if ($claimed.ContainsKey($final)) {
        $final = "$pack-$slug"
        if ($claimed.ContainsKey($final)) { $final = "$pack-$slug-2" }
        if ((Get-FrontmatterValue $c.md 'name')) { Set-FrontmatterName $c.md $final }
      }
      $claimed[$final] = $pack

      $outDir = Join-Path $target $final
      Copy-Item -Recurse -Force (Join-Path $dir $c.dir) $outDir
      $results.Add([pscustomobject]@{ pack = $pack; skill = $final; status = 'installed'; detail = $c.dir })
    }
  }
  catch {
    $results.Add([pscustomobject]@{ pack = $pack; skill = $null; status = 'error'; detail = $_.Exception.Message })
  }
}

$results | ConvertTo-Json -Depth 4 | Set-Content -Path $report -Encoding utf8
$results | Group-Object status | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Name, $_.Count) }
Write-Output "total dirs: $(@(Get-ChildItem $target -Directory -Force).Count)"
