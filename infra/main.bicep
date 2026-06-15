targetScope = 'resourceGroup'

@description('Environment name used as a prefix for resources.')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

var staticWebAppName = 'swa-${take(toLower(uniqueString(resourceGroup().id, environmentName)), 20)}'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  tags: {
    'azd-service-name': 'web'
  }
  properties: {
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
    publicNetworkAccess: 'Enabled'
  }
}

output AZURE_WEBAPP_NAME string = staticWebApp.name
output AZURE_WEBAPP_URL string = 'https://${staticWebApp.properties.defaultHostname}'
