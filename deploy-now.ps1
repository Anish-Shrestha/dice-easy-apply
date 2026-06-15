#!/usr/bin/env pwsh
# Deploy DICE Easy Apply to Azure Static Web Apps - INSTANT DEPLOYMENT

param(
    [string]$DeploymentToken,
    [bool]$Interactive = $true
)

$zipPath = ".\deploy.zip"
$swaName = "swa-jk7laromye55a"
$swaUrl = "https://green-mud-08500ab0f.7.azurestaticapps.net"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   DICE Easy Apply - Azure Static Web Apps Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if deployment token is provided
if (-not $DeploymentToken -or $DeploymentToken -eq "") {
    Write-Host "STEP 1: Get Deployment Token" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option A: Use PowerShell One-Liner (needs Azure CLI installed)"
    Write-Host "  [TOKEN] = (az staticwebapp secrets list --name $swaName -g rg-dice-prod --query properties.apiKey -o tsv)"
    Write-Host ""
    Write-Host "Option B: Get from Azure Portal"
    Write-Host "  1. Open: https://portal.azure.com"
    Write-Host "  2. Navigate: Resource Groups > rg-dice-prod > $swaName"
    Write-Host "  3. Select: Deployment (left sidebar menu)"
    Write-Host "  4. Click: Manage deployment token"
    Write-Host "  5. Copy: The full deployment URL (starts with https://)"
    Write-Host ""
    
    if ($Interactive) {
        $DeploymentToken = Read-Host "Enter deployment URL/token"
        
        if (-not $DeploymentToken) {
            Write-Host "Attempting to get token via Azure CLI..." -ForegroundColor Cyan
            try {
                $DeploymentToken = & az staticwebapp secrets list --name $swaName -g rg-dice-prod --query "properties.apiKey" -o tsv 2>$null
                if ($DeploymentToken) {
                    Write-Host "[OK] Token acquired from Azure CLI" -ForegroundColor Green
                } else {
                    Write-Host "[ERROR] Failed. Please enter token manually." -ForegroundColor Red
                    $DeploymentToken = Read-Host "Deployment token"
                }
            } catch {
                Write-Host "Azure CLI not available. Paste deployment URL manually:" -ForegroundColor Yellow
                $DeploymentToken = Read-Host "Deployment token/URL"
            }
        }
    }
}

if (-not $DeploymentToken -or $DeploymentToken -eq "") {
    Write-Error "No deployment token provided. Cannot proceed."
    exit 1
}

Write-Host "[OK] Deployment token received" -ForegroundColor Green
Write-Host ""

# Verify zip exists
Write-Host "STEP 2: Verify deployment package" -ForegroundColor Yellow
if (-not (Test-Path $zipPath)) {
    Write-Error "Deployment package not found: $zipPath"
    exit 1
}

$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Host "[OK] Package ready: $zipPath ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
Write-Host ""

# Upload to SWA
Write-Host "STEP 3: Upload to Static Web App" -ForegroundColor Yellow
Write-Host "Deploying to: $swaUrl"
Write-Host ""

try {
    Write-Host "[..] Uploading..." -ForegroundColor Cyan
    
    $headers = @{
        "Content-Type" = "application/zip"
    }
    
    $response = Invoke-WebRequest `
        -Uri $DeploymentToken `
        -Method Post `
        -InFile $zipPath `
        -Headers $headers `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "[OK] Upload successful (Status: $($response.StatusCode))" -ForegroundColor Green
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "   DEPLOYMENT COMPLETE!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your app will be live in 1-2 minutes at:" -ForegroundColor Cyan
    Write-Host "  $swaUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Wait 1-2 minutes for deployment to complete"
    Write-Host "  2. Visit: $swaUrl"
    Write-Host "  3. Your DICE Easy Apply app is now live!"
    Write-Host ""
    
} catch {
    Write-Host "[ERROR] Upload failed" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:"
    Write-Host "  - Verify deployment token is correct"
    Write-Host "  - Token must start with 'https://'"
    Write-Host "  - Try again in a few moments"
    exit 1
}
