# Deploy script for Game Manager Cloud Functions (PowerShell)
Write-Host "🚀 Deploying Game Manager Cloud Functions..." -ForegroundColor Green

# Set project ID
$PROJECT_ID = "gamemanagerproxy"
$REGION = "us-central1"

# Function to deploy a Cloud Function
function Deploy-Function {
    param(
        [string]$FunctionName,
        [string]$SourceDir,
        [string]$EntryPoint,
        [string]$Description
    )
    
    Write-Host "📦 Deploying $FunctionName..." -ForegroundColor Blue
    
    $deployCommand = @(
        "gcloud", "functions", "deploy", $FunctionName,
        "--gen2",
        "--runtime=nodejs18",
        "--region=$REGION",
        "--source=$SourceDir",
        "--entry-point=$EntryPoint",
        "--trigger=http",
        "--allow-unauthenticated",
        "--timeout=60s",
        "--memory=256MB",
        "--max-instances=10",
        "--set-env-vars=GOOGLE_CLOUD_PROJECT=$PROJECT_ID",
        "--description=$Description"
    )
    
    & $deployCommand[0] $deployCommand[1..($deployCommand.Length - 1)]
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $FunctionName deployed successfully" -ForegroundColor Green
        
        # Get function URL
        $functionUrl = & gcloud functions describe $FunctionName --region=$REGION --format="value(serviceConfig.uri)"
        Write-Host "🔗 Function URL: $functionUrl" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "❌ Failed to deploy $FunctionName" -ForegroundColor Red
        exit 1
    }
}

# Verify gcloud is authenticated and project is set
Write-Host "🔍 Verifying Google Cloud setup..." -ForegroundColor Blue
$currentProject = & gcloud config get-value project 2>$null

if ($currentProject -ne $PROJECT_ID) {
    Write-Host "⚠️  Setting project to $PROJECT_ID" -ForegroundColor Yellow
    & gcloud config set project $PROJECT_ID
}

$currentProject = & gcloud config get-value project
Write-Host "📋 Using project: $currentProject" -ForegroundColor Cyan
Write-Host "📍 Using region: $REGION" -ForegroundColor Cyan
Write-Host ""

# Deploy functions
Deploy-Function -FunctionName "key-generator" -SourceDir "./key-generator" -EntryPoint "generateKey" -Description "Generate JWT tokens for Game Manager installations"

Deploy-Function -FunctionName "real-debrid-proxy" -SourceDir "./real-debrid-proxy" -EntryPoint "realDebridProxy" -Description "Proxy for Real-Debrid API calls"

Deploy-Function -FunctionName "igdb-proxy" -SourceDir "./igdb-proxy" -EntryPoint "igdbProxy" -Description "Proxy for IGDB API calls with OAuth token management"

Write-Host "🎉 All functions deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Function URLs:" -ForegroundColor Cyan

$keyGenUrl = & gcloud functions describe key-generator --region=$REGION --format="value(serviceConfig.uri)"
$rdUrl = & gcloud functions describe real-debrid-proxy --region=$REGION --format="value(serviceConfig.uri)"
$igdbUrl = & gcloud functions describe igdb-proxy --region=$REGION --format="value(serviceConfig.uri)"

Write-Host "├── Key Generator: $keyGenUrl" -ForegroundColor White
Write-Host "├── Real-Debrid Proxy: $rdUrl" -ForegroundColor White
Write-Host "└── IGDB Proxy: $igdbUrl" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Next steps:" -ForegroundColor Yellow
Write-Host "1. Test the functions using the URLs above"
Write-Host "2. Update your Electron app to use these proxy URLs"
Write-Host "3. Remove direct API credentials from your app"
Write-Host ""
Write-Host "✨ Your API credentials are now secure in Google Cloud!" -ForegroundColor Green
