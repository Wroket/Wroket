# Build e-Soleau deposit package for Wroket (source zip + manifest + printable docs).
# Usage: from repo root:  .\scripts\inpi-deposit\build-deposit.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$date = Get-Date -Format "yyyy-MM-dd"
$outDir = Join-Path $repoRoot "inpi-deposit\output\$date"
$docsSrc = Join-Path $repoRoot "docs\inpi-deposit"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "[inpi-deposit] Output: $outDir"

# 1. Source archive (git tracked files only)
$zipName = "wroket-source-$date.zip"
$zipPath = Join-Path $outDir $zipName

Write-Host "[inpi-deposit] Creating git archive..."
& git archive --format=zip "--prefix=wroket/" -o $zipPath HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive failed" }

$zipSize = (Get-Item $zipPath).Length
Write-Host "[inpi-deposit] Archive: $zipName ($([math]::Round($zipSize / 1MB, 2)) MB)"

if ($zipSize -gt 95MB) {
  Write-Warning "Archive exceeds 95 MB - INPI limit is 100 MB total for all 5 files."
}

# 2. SHA-256 manifest of every file inside the zip
$manifestPath = Join-Path $outDir "wroket-manifeste.txt"
$tempExtract = Join-Path $env:TEMP "wroket-inpi-manifest-$date"

if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
New-Item -ItemType Directory -Force -Path $tempExtract | Out-Null

Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force

Add-Type -AssemblyName System.Security
$sha256 = [System.Security.Cryptography.SHA256]::Create()

function Get-FileSha256Hex {
  param([string]$Path)
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $bytes = $sha256.ComputeHash($stream)
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
  } finally {
    $stream.Close()
  }
}

$zipHash = Get-FileSha256Hex -Path $zipPath
$lines = New-Object System.Collections.Generic.List[string]
[void]$lines.Add("Wroket - Manifeste d'integrite SHA-256")
[void]$lines.Add("Date de generation: $date")
[void]$lines.Add("Archive: $zipName")
[void]$lines.Add("Archive SHA-256: $zipHash")
[void]$lines.Add("")
[void]$lines.Add("Format: relative_path | size_bytes | sha256")
[void]$lines.Add("----------------------------------------------------------------")
[void]$lines.Add("")

$files = Get-ChildItem -Path $tempExtract -Recurse -File | Sort-Object FullName
foreach ($f in $files) {
  $rel = $f.FullName.Substring($tempExtract.Length).TrimStart('\', '/').Replace('\', '/')
  $hash = Get-FileSha256Hex -Path $f.FullName
  [void]$lines.Add("$rel | $($f.Length) | $hash")
}

[void]$lines.Add("")
[void]$lines.Add("Total fichiers: $($files.Count)")

$lines | Out-File -FilePath $manifestPath -Encoding utf8
Remove-Item -Recurse -Force $tempExtract
Write-Host "[inpi-deposit] Manifest: wroket-manifeste.txt ($($files.Count) files)"

# 3. Copy markdown sources + generate printable HTML
$mdFiles = @(
  "wroket-description.md",
  "wroket-architecture.md",
  "wroket-roadmap-extrait.md"
)

function Convert-MdToPrintHtml {
  param(
    [string]$MdPath,
    [string]$HtmlPath,
    [string]$Title
  )
  $rawLines = Get-Content -Path $MdPath -Encoding UTF8
  $htmlLines = New-Object System.Collections.Generic.List[string]

  $inTable = $false
  foreach ($line in $rawLines) {
    if ($line -match '^\|(.+)\|$') {
      $cells = ($Matches[1] -split '\|') | ForEach-Object { $_.Trim() }
      if ($cells -join '' -match '^[-:\s|]+$') { continue }
      if (-not $inTable) {
        [void]$htmlLines.Add('<table>')
        $inTable = $true
      }
      $tds = ($cells | ForEach-Object { "<td>$_</td>" }) -join ''
      [void]$htmlLines.Add("<tr>$tds</tr>")
      continue
    }
    if ($inTable) {
      [void]$htmlLines.Add('</table>')
      $inTable = $false
    }
    if ($line -match '^# (.+)$') { [void]$htmlLines.Add("<h1>$($Matches[1])</h1>"); continue }
    if ($line -match '^## (.+)$') { [void]$htmlLines.Add("<h2>$($Matches[1])</h2>"); continue }
    if ($line -match '^### (.+)$') { [void]$htmlLines.Add("<h3>$($Matches[1])</h3>"); continue }
    if ($line -eq '---') { [void]$htmlLines.Add('<hr/>'); continue }
    if ($line -match '^- (.+)$') { [void]$htmlLines.Add("<li>$($Matches[1])</li>"); continue }
    if ($line -match '^\d+\. (.+)$') { [void]$htmlLines.Add("<li>$($Matches[1])</li>"); continue }
    if ($line.Trim() -eq '') { continue }
    $escaped = $line -replace '\*\*(.+?)\*\*', '<strong>$1</strong>'
    $escaped = $escaped -replace '`([^`]+)`', '<code>$1</code>'
    [void]$htmlLines.Add("<p>$escaped</p>")
  }
  if ($inTable) { [void]$htmlLines.Add('</table>') }

  $body = $htmlLines -join "`n"
  @"
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>$Title</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; color: #111; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.5rem; }
    h3 { font-size: 1rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
    td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; text-align: left; }
    code { background: #f4f4f4; padding: 0.1rem 0.25rem; font-size: 0.85em; }
    hr { margin: 1.5rem 0; border: none; border-top: 1px solid #ddd; }
    @media print { body { margin: 1cm; } }
  </style>
</head>
<body>
$body
</body>
</html>
"@ | Out-File -FilePath $HtmlPath -Encoding utf8
}

foreach ($md in $mdFiles) {
  $src = Join-Path $docsSrc $md
  Copy-Item -Path $src -Destination (Join-Path $outDir $md) -Force
  $base = [System.IO.Path]::GetFileNameWithoutExtension($md)
  $htmlOut = Join-Path $outDir "$base.html"
  Convert-MdToPrintHtml -MdPath $src -HtmlPath $htmlOut -Title $base
  Write-Host "[inpi-deposit] HTML: $base.html (Print to PDF in browser)"
}

# 4. Optional Pandoc PDF
$pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
if ($pandoc) {
  foreach ($md in $mdFiles) {
    $src = Join-Path $docsSrc $md
    $base = [System.IO.Path]::GetFileNameWithoutExtension($md)
    $pdfOut = Join-Path $outDir "$base.pdf"
    & pandoc $src -o $pdfOut -V geometry:margin=2cm
    Write-Host "[inpi-deposit] PDF: $base.pdf"
  }
} else {
  Write-Host "[inpi-deposit] Pandoc not found - trying Edge headless PDF..."
  $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
  if (Test-Path $edge) {
    foreach ($md in $mdFiles) {
      $base = [System.IO.Path]::GetFileNameWithoutExtension($md)
      $htmlOut = Join-Path $outDir "$base.html"
      $pdfOut = Join-Path $outDir "$base.pdf"
      & $edge --headless --disable-gpu --no-pdf-header-footer "--print-to-pdf=$pdfOut" $htmlOut 2>$null
      Start-Sleep -Seconds 2
      if (Test-Path $pdfOut) { Write-Host "[inpi-deposit] PDF: $base.pdf" }
    }
  } else {
    Write-Host "[inpi-deposit] Open .html files and Print > Save as PDF"
  }
}

Write-Host ""
Write-Host "=== Depot e-Soleau - fichiers prets ==="
Write-Host "  1. $zipName"
Write-Host "  2. wroket-description.pdf (or .html to PDF)"
Write-Host "  3. wroket-architecture.pdf (or .html to PDF)"
Write-Host "  4. wroket-manifeste.txt"
Write-Host "  5. wroket-roadmap-extrait.pdf (or .html to PDF)"
Write-Host ""
Write-Host "Next: docs/inpi-deposit/GUIDE-DEPOT-INPI.md"
