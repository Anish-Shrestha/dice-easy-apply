#!/usr/bin/env pwsh

param(
    [string]$ResourceGroup = "rg-dice-prod",
    [string]$SwaName = "swa-jk7laromye55a",
    [string]$BuildDir = ".\dice-easy-apply-angular\dist\dice-easy-apply-angular"
)

Write-Host "Creating deployment package for Static Web App..." -ForegroundColor Green

if (-not (Test-Path $BuildDir)) {
    Write-Error "Build directory not found: $BuildDir"
    exit 1
}

$zipPath = ".\deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path "$BuildDir\*" -DestinationPath $zipPath -Force

if (Test-Path $zipPath) {
    Write-Host "SUCCESS: Deployment package created at: $zipPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "To deploy, use GitHub Actions:"
    Write-Host "  - Push code to GitHub"
    Write-Host "  - Set GitHub secret: AZURE_STATIC_WEB_APPS_API_TOKEN"
    Write-Host "  - Push triggers .github/workflows/deploy-swa.yml"
} else {
    Write-Error "Failed to create deployment package"
    exit 1
}
