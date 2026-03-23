param(
  [Parameter(Mandatory = $true)]
  [string]$VmHost = "gcp-vm",

  [Parameter(Mandatory = $true)]
  [string]$ImageRef,

  [Parameter(Mandatory = $false)]
  [int]$AppPort = 3000,

  [Parameter(Mandatory = $false)]
  [string]$ContainerName = "wroket-api"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[deploy] VM host: $VmHost"
Write-Host "[deploy] Image: $ImageRef"
Write-Host "[deploy] Container: $ContainerName"

$remoteCmd = @"
set -e
echo '[remote] Pull image'
docker pull $ImageRef

echo '[remote] Stop previous container (if exists)'
docker rm -f $ContainerName 2>/dev/null || true

echo '[remote] Run new container'
docker run -d \
  --name $ContainerName \
  --restart unless-stopped \
  -p $AppPort`:3000 \
  $ImageRef

echo '[remote] Running containers'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
"@

ssh $VmHost $remoteCmd

Write-Host "[deploy] Done."

