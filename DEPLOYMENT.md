# DICE Easy Apply - Deployment Guide

## Status: ✅ Ready for Deployment

Your Angular application is **provisioned and built** on Azure Static Web Apps. The infrastructure and application code are ready for deployment.

### What's Been Done

✅ **Infrastructure Provisioned**
- Static Web App: `swa-jk7laromye55a`
- Resource Group: `rg-dice-prod`
- Region: East US 2
- Tier: Free (no VM quota needed)

✅ **Application Built**
- Angular build successful: `dice-easy-apply-angular/dist/dice-easy-apply-angular/`
- All assets ready: HTML, CSS, JavaScript bundles
- Deployment package created: `deploy.zip`

✅ **Configuration Files**
- `azure.yaml`: Updated for Static Web Apps
- `infra/main.bicep`: SWA resource definitions
- `staticwebapp.config.json`: Routing configuration
- `.github/workflows/deploy-swa.yml`: CI/CD pipeline ready

---

## Deployment Methods

### Method 1: GitHub Actions (Recommended) ⭐

**Best for**: Continuous integration, team workflows, automated deployments

1. **Push to GitHub**
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: DICE Easy Apply Angular app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
   git push -u origin main
   ```

2. **Get Deployment Token from Azure Portal**
   - Go to: https://portal.azure.com
   - Find: `swa-jk7laromye55a` in resource group `rg-dice-prod`
   - Click: Deployment → Manage deployment token
   - Copy: API token

3. **Set GitHub Secret**
   - Go to your GitHub repository
   - Settings → Secrets and variables → Actions
   - New repository secret:
     - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
     - Value: Paste the token from step 2

4. **Trigger Deployment**
   - Push to main branch (or create a PR)
   - GitHub Actions automatically builds and deploys
   - Monitor at: Actions tab in GitHub

**Workflow file**: `.github/workflows/deploy-swa.yml`

---

### Method 2: PowerShell + SWA CLI (Manual)

**Best for**: Quick testing, one-off deployments

1. **Get Deployment Token**
   - Azure Portal → Static Web App `swa-jk7laromye55a`
   - Deployment → Manage deployment token
   - Copy deployment URL

2. **Deploy via PowerShell**
   ```powershell
   $deployUrl = "https://green-mud-08500ab0f.7.azurestaticapps.net?code=YOUR_TOKEN"
   Invoke-WebRequest -Uri $deployUrl -Method Post -InFile ".\deploy.zip" -ContentType "application/zip"
   ```

---

### Method 3: Azure CLI

**If Azure CLI is installed**:
```bash
az staticwebapp environment functions list --name swa-jk7laromye55a -g rg-dice-prod
```

---

## Verify Deployment

Once deployed, access your app at:
```
https://green-mud-08500ab0f.7.azurestaticapps.net/
```

**What to check**:
- [ ] Angular app loads without errors
- [ ] DICE job search interface is visible
- [ ] Navigation works
- [ ] No 404 errors in browser console
- [ ] CSS and JavaScript assets loaded

---

## Troubleshooting

### Application not loading?
- Check browser console for errors (F12)
- Verify `staticwebapp.config.json` routing is correct
- Ensure all assets are in `deploy.zip`

### GitHub Actions workflow failing?
- Check Action logs for build/deployment errors
- Verify `AZURE_STATIC_WEB_APPS_API_TOKEN` secret is set correctly
- Ensure `.github/workflows/deploy-swa.yml` exists

### Build errors during deployment?
- Angular build succeeded locally (✓ confirmed)
- Check Node.js version compatibility (workflow uses Node 18)
- Verify npm dependencies install correctly

---

## Project Structure

```
.
├── azure.yaml                              # Azure Developer CLI config
├── infra/
│   └── main.bicep                          # Infrastructure as Code
├── dice-easy-apply-angular/                # Angular application
│   ├── src/
│   ├── dist/                               # Build output (ready for deploy)
│   ├── angular.json
│   └── package.json
├── deploy.zip                              # Deployment package
├── deploy-to-swa.ps1                       # Deployment helper script
├── .github/
│   └── workflows/
│       └── deploy-swa.yml                  # GitHub Actions workflow
└── staticwebapp.config.json                # SWA routing config
```

---

## Azure Static Web Apps Features

Your deployment includes:

- **Free Tier**: No charges for hosting
- **Global CDN**: Fast content delivery
- **HTTPS**: Automatic SSL/TLS
- **Staging Environments**: Pull request previews
- **GitHub Integration**: Push-to-deploy workflow

---

## Next Steps

1. **Choose a deployment method** (GitHub Actions recommended)
2. **Follow the steps** for your chosen method
3. **Verify** the app is accessible at the SWA URL
4. **Enjoy** your DICE Easy Apply tool running on Azure!

---

## Support

- **SWA Documentation**: https://docs.microsoft.com/azure/static-web-apps/
- **Azure Portal**: https://portal.azure.com
- **GitHub Actions Docs**: https://docs.github.com/actions
- **Azure Developer CLI**: https://aka.ms/azd

---

**Deployment Date**: 2026-06-15
**Infrastructure**: Azure Static Web Apps (Free)
**Application**: Angular 17 - DICE Easy Apply Job Search Tool
