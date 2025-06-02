#!/bin/bash

# Deploy script for Game Manager Cloud Functions
echo "🚀 Deploying Game Manager Cloud Functions..."

# Set project ID
PROJECT_ID="gamemanagerproxy"
REGION="us-central1"

# Function to deploy a Cloud Function
deploy_function() {
    local FUNCTION_NAME=$1
    local SOURCE_DIR=$2
    local ENTRY_POINT=$3
    local DESCRIPTION=$4
    
    echo "📦 Deploying $FUNCTION_NAME..."
    
    gcloud functions deploy $FUNCTION_NAME \
        --gen2 \
        --runtime=nodejs18 \
        --region=$REGION \
        --source=$SOURCE_DIR \
        --entry-point=$ENTRY_POINT \
        --trigger=http \
        --allow-unauthenticated \
        --timeout=60s \
        --memory=256MB \
        --max-instances=10 \
        --set-env-vars=GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
        --description="$DESCRIPTION"
    
    if [ $? -eq 0 ]; then
        echo "✅ $FUNCTION_NAME deployed successfully"
        
        # Get function URL
        FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format="value(serviceConfig.uri)")
        echo "🔗 Function URL: $FUNCTION_URL"
        echo ""
    else
        echo "❌ Failed to deploy $FUNCTION_NAME"
        exit 1
    fi
}

# Verify gcloud is authenticated and project is set
echo "🔍 Verifying Google Cloud setup..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "⚠️  Setting project to $PROJECT_ID"
    gcloud config set project $PROJECT_ID
fi

echo "📋 Using project: $(gcloud config get-value project)"
echo "📍 Using region: $REGION"
echo ""

# Deploy functions
deploy_function "key-generator" "./key-generator" "generateKey" "Generate JWT tokens for Game Manager installations"

deploy_function "real-debrid-proxy" "./real-debrid-proxy" "realDebridProxy" "Proxy for Real-Debrid API calls"

deploy_function "igdb-proxy" "./igdb-proxy" "igdbProxy" "Proxy for IGDB API calls with OAuth token management"

echo "🎉 All functions deployed successfully!"
echo ""
echo "📋 Function URLs:"
echo "├── Key Generator: $(gcloud functions describe key-generator --region=$REGION --format="value(serviceConfig.uri)")"
echo "├── Real-Debrid Proxy: $(gcloud functions describe real-debrid-proxy --region=$REGION --format="value(serviceConfig.uri)")"
echo "└── IGDB Proxy: $(gcloud functions describe igdb-proxy --region=$REGION --format="value(serviceConfig.uri)")"
echo ""
echo "🔧 Next steps:"
echo "1. Test the functions using the URLs above"
echo "2. Update your Electron app to use these proxy URLs"
echo "3. Remove direct API credentials from your app"
echo ""
echo "✨ Your API credentials are now secure in Google Cloud!"
