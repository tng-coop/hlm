$ErrorActionPreference = "Stop"

$projectName = "hlm"
$version = (Get-Content package.json | ConvertFrom-Json).version
if (-not $version) { $version = "1.0.0" }

$zipName = "${projectName}-v${version}.zip"
$zipPath = "$PSScriptRoot\dist\$zipName"
$distPath = "$PSScriptRoot\dist"
if (-not (Test-Path $distPath)) { New-Item -ItemType Directory -Path $distPath | Out-Null }
$tempStage = "$env:TEMP\hlm-build"

Write-Host ">> Preparing release zip: $zipName" -ForegroundColor Cyan

# 1. Prepare an empty staging folder
if (Test-Path $tempStage) { Remove-Item -Recurse -Force $tempStage }
New-Item -ItemType Directory -Path $tempStage | Out-Null
$targetFolder = "$tempStage\${projectName}"
New-Item -ItemType Directory -Path $targetFolder | Out-Null

# 2. Define what to exclude (node_modules, local database files, .git, etc)
$excludeList = @(
    ".git"
    ".node"
    "node_modules"
    "dist"
    "hlm.db*"
    "build-release.ps1"
)

# 3. Copy files to the staging folder
Write-Host ">> Copying source files..." -ForegroundColor Cyan
Get-ChildItem -Path $PSScriptRoot -Exclude $excludeList | Copy-Item -Destination $targetFolder -Recurse -Force

# 4. Create the ZIP file
Write-Host ">> Compressing to $zipPath..." -ForegroundColor Cyan
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path $targetFolder -DestinationPath $zipPath

# 5. Clean up temporary staging
Remove-Item -Recurse -Force $tempStage

Write-Host "[OK] Release successfully created at:" -ForegroundColor Green
Write-Host $zipPath -ForegroundColor White
