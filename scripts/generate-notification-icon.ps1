# Generates an opaque, centered 512x512 push notification icon (no transparency).
Add-Type -AssemblyName System.Drawing

$size = 512
$outPath = Join-Path $PSScriptRoot "..\frontend\public\wroket-notification-icon.png"
$srcPath = Join-Path $PSScriptRoot "..\frontend\src\app\icon.png"

$bg = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
$canvas = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.Clear($bg)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$logo = [System.Drawing.Image]::FromFile($srcPath)
$logoSize = 360
$x = [int](($size - $logoSize) / 2)
$y = [int](($size - $logoSize) / 2)
$g.DrawImage($logo, $x, $y, $logoSize, $logoSize)
$logo.Dispose()
$g.Dispose()

# Flatten to 24bpp RGB (no alpha channel) for Windows notification center.
$flat = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g2 = [System.Drawing.Graphics]::FromImage($flat)
$g2.DrawImage($canvas, 0, 0)
$g2.Dispose()
$canvas.Dispose()

if (Test-Path $outPath) { Remove-Item $outPath -Force }
$flat.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$flat.Dispose()

$check = [System.Drawing.Bitmap]::FromFile($outPath)
Write-Host "Saved $outPath ($($check.Width)x$($check.Height), $($check.PixelFormat))"
$check.Dispose()
