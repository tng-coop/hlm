<#
.SYNOPSIS
  Idempotent Windows Installer (Zero-Privilege Portable Version) for TNG Co-op System.
  
.DESCRIPTION
  This script downloads a standalone, portable ZIP of Node.js directly into the project folder.
  It does NOT require Administrator rights, will never trigger a UAC prompt, and will not alter the host machine's system registry or paths.
#>

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n>> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

# Define local portable node path
$nodeDir = "$PSScriptRoot\.node"
$nodeExe = "$nodeDir\node.exe"
$npmCli = "$nodeDir\node_modules\npm\bin\npm-cli.js"

# 1. Provide Portable Node.js (No Admin Required)
Write-Step "Checking for Portable Node.js environment..."

if (Test-Path $nodeExe) {
    $nodeVersion = & $nodeExe -v
    Write-Success "Portable Node.js environment is ready ($nodeVersion)."
} else {
    Write-Host "[!] Portable Node.js not found. Downloading standalone zip (No Admin required)..." -ForegroundColor Yellow
    
    $zipPath = "$env:TEMP\node-portable.zip"
    $nodeVersion = "v22.14.0"
    
    # Download the official Windows x64 binary ZIP
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $zipPath
    
    Write-Step "Extracting Node.js. This may take a minute..."
    # Extract to a temporary folder first
    $tempExtract = "$env:TEMP\node-extract"
    if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
    Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
    
    # Move the inner contents to our hidden .node folder
    $innerFolder = Get-ChildItem -Path $tempExtract | Select-Object -First 1
    Move-Item -Path $innerFolder.FullName -Destination $nodeDir -Force
    
    # Cleanup
    Remove-Item $zipPath -Force
    Remove-Item -Recurse -Force $tempExtract
    
    Write-Success "Portable Node.js extracted successfully to hidden folder."
}

# Add local node to session Path so npm works normally within this script execution
$env:Path = "$nodeDir;" + $env:Path

# 2. Check and Install Project Dependencies using NPM
Write-Step "Synchronizing project dependencies (npm install)..."
try {
    # Force npm to use cmd.exe to parse dependency scripts properly (avoids PowerShell '||' syntax errors)
    $env:npm_config_script_shell = "cmd.exe"

    # Execute npm via the local portable node executable
    & $nodeExe $npmCli install --no-audit --no-fund
    
    # PowerShell's '&' operator doesn't catch external command exit codes, so we check manually
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    
    Write-Success "Dependencies synchronized."
} catch {
    Write-Error "Failed to install dependencies. Check error logs above."
    exit 1
}

# 3. Completion
Write-Step "System is fully isolated and ready!"
Write-Host "You can start the server anytime by running the 'Start Co-op System' shortcut." -ForegroundColor Yellow

Write-Step "Starting application backend & frontend..."
& $nodeExe $npmCli start
