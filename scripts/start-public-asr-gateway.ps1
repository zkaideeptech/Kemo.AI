param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 43119,
  [string]$CloudflaredPath = "",
  [string]$TunnelToken = "",
  [string]$NamedTunnelUrl = "",
  [switch]$NoEnvWrite
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $ProjectRoot ".env.local"
$GatewayOut = Join-Path $ProjectRoot ".codex-asr-gateway.out.log"
$GatewayErr = Join-Path $ProjectRoot ".codex-asr-gateway.err.log"
$TunnelOut = Join-Path $ProjectRoot ".codex-asr-tunnel.out.log"
$TunnelErr = Join-Path $ProjectRoot ".codex-asr-tunnel.err.log"

if (-not $CloudflaredPath) {
  $BundledCloudflared = Join-Path $ProjectRoot "tools\cloudflared.exe"
  $CloudflaredPath = if (Test-Path $BundledCloudflared) { $BundledCloudflared } else { "cloudflared" }
}

function Update-EnvValue {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Value
  )

  $line = "$Name=$Value"
  if (Test-Path $Path) {
    $content = Get-Content -LiteralPath $Path
    $updated = $false
    $next = foreach ($entry in $content) {
      if ($entry -match "^\s*$([regex]::Escape($Name))=") {
        $updated = $true
        $line
      } else {
        $entry
      }
    }
    if (-not $updated) {
      $next += $line
    }
    Set-Content -LiteralPath $Path -Value $next -Encoding UTF8
  } else {
    Set-Content -LiteralPath $Path -Value $line -Encoding UTF8
  }
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 400
    }
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Get-TryCloudflareUrl {
  param(
    [string]$LogPath,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $pattern = "https://[-a-zA-Z0-9.]+\.trycloudflare\.com"
  do {
    if (Test-Path $LogPath) {
      $text = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
      $match = [regex]::Match($text, $pattern)
      if ($match.Success) {
        return $match.Value
      }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return ""
}

Push-Location $ProjectRoot
try {
  $env:KEMO_ASR_GATEWAY_HOST = $HostName
  $env:KEMO_ASR_GATEWAY_PORT = [string]$Port

  $gatewayHealthy = Wait-HttpOk "http://$HostName`:$Port/health" 2
  if (-not $gatewayHealthy) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $npmPath = if ($npmCommand) { $npmCommand.Source } else { "" }
    if (-not $npmPath) {
      $npmPath = (Get-Command npm -ErrorAction Stop).Source
    }

    Start-Process -FilePath $npmPath -ArgumentList @("run", "asr:gateway") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $GatewayOut -RedirectStandardError $GatewayErr

    if (-not (Wait-HttpOk "http://$HostName`:$Port/health" 25)) {
      throw "ASR gateway did not become healthy at http://$HostName`:$Port/health. See $GatewayErr"
    }
  }

  $publicBaseUrl = ""
  if ($NamedTunnelUrl) {
    $publicBaseUrl = $NamedTunnelUrl.TrimEnd("/")
  } elseif ($TunnelToken) {
    Start-Process -FilePath $CloudflaredPath -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $TunnelToken) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr
    throw "Named Cloudflare Tunnel started with token. Set -NamedTunnelUrl to the public https URL so this script can write KEMO_ASR_GATEWAY_PUBLIC_WS_URL."
  } else {
    Start-Process -FilePath $CloudflaredPath -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://$HostName`:$Port") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr
    $publicBaseUrl = Get-TryCloudflareUrl $TunnelErr 45
    if (-not $publicBaseUrl) {
      $publicBaseUrl = Get-TryCloudflareUrl $TunnelOut 10
    }
  }

  if (-not $publicBaseUrl) {
    throw "Could not determine public Cloudflare Tunnel URL. See $TunnelOut and $TunnelErr"
  }

  $publicWsUrl = $publicBaseUrl -replace "^https://", "wss://"
  $publicWsUrl = ($publicWsUrl.TrimEnd("/")) + "/browser"

  if (-not $NoEnvWrite) {
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_HOST" $HostName
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_PORT" ([string]$Port)
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_PUBLIC_WS_URL" $publicWsUrl
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_HEALTH_TIMEOUT_MS" "1500"
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_BOOT_TIMEOUT_MS" "15000"
    Update-EnvValue $EnvPath "KEMO_ASR_GATEWAY_REQUEST_TIMEOUT_MS" "30000"
  }

  [pscustomobject]@{
    gatewayHealthUrl = "http://$HostName`:$Port/health"
    publicBaseUrl = $publicBaseUrl
    publicWsUrl = $publicWsUrl
    envPath = $EnvPath
    gatewayLog = $GatewayOut
    tunnelLog = $TunnelErr
  } | ConvertTo-Json -Depth 3
} finally {
  Pop-Location
}
