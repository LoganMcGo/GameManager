# Game Manager Cloud Functions

This directory contains the serverless proxy functions that secure your API credentials in Google Cloud while providing seamless access to Real-Debrid and IGDB APIs.

## Architecture

```
Electron App → Cloud Functions → External APIs
              ↑
         JWT Authentication
              ↑
         Unique per installation
```

## Functions

### 1. Key Generator (`key-generator`)
- **Purpose**: Issues JWT tokens to new Game Manager installations
- **Endpoint**: `/generateKey`
- **Method**: POST
- **Authentication**: None (rate limited by IP)

### 2. Real-Debrid Proxy (`real-debrid-proxy`) 
- **Purpose**: Proxies all Real-Debrid API calls using your stored API key
- **Endpoint**: `/{real-debrid-path}`
- **Methods**: GET, POST, PUT, DELETE
- **Authentication**: JWT Bearer token

### 3. IGDB Proxy (`igdb-proxy`)
- **Purpose**: Proxies all IGDB API calls with automatic OAuth token management
- **Endpoint**: `/{igdb-endpoint}`
- **Methods**: GET, POST
- **Authentication**: JWT Bearer token

## Security Features

- ✅ **JWT-based authentication** - Each installation gets unique token
- ✅ **Rate limiting** - 60 requests/minute per machine
- ✅ **Credential isolation** - API keys never leave Google Cloud
- ✅ **Time-limited tokens** - 1 year expiration with auto-renewal
- ✅ **Machine fingerprinting** - Tokens tied to specific installations
- ✅ **CORS enabled** - Ready for browser-based requests

## Deployment

### Prerequisites
1. Google Cloud project created (`gamemanagerproxy`)
2. Required APIs enabled:
   - Cloud Functions API
   - Secret Manager API  
   - Cloud Build API
3. Billing account linked
4. gcloud CLI installed and authenticated
5. Secrets created in Secret Manager:
   - `real-debrid-apikey`
   - `igdb-client-id`
   - `igdb-client-secret`
   - `jwt-secret` (auto-generated)

### Deploy Functions

**Windows (PowerShell):**
```powershell
.\deploy.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x deploy.sh
./deploy.sh
```

### Function URLs
After deployment, you'll get URLs like:
- Key Generator: `https://us-central1-gamemanagerproxy.cloudfunctions.net/key-generator`
- Real-Debrid Proxy: `https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy`
- IGDB Proxy: `https://us-central1-gamemanagerproxy.cloudfunctions.net/igdb-proxy`

## Testing

### Test Key Generation
```bash
curl -X POST https://us-central1-gamemanagerproxy.cloudfunctions.net/key-generator \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "test-pc",
    "username": "testuser", 
    "platform": "win32",
    "arch": "x64",
    "appVersion": "1.0.0"
  }'
```

### Test Real-Debrid Proxy
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy/user
```

### Test IGDB Proxy
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: text/plain" \
  -d "fields name; limit 1;" \
  https://us-central1-gamemanagerproxy.cloudfunctions.net/igdb-proxy/games
```

## Cost Estimation

**Monthly costs for typical usage:**
- Cloud Functions: ~$0.05 (free tier covers most usage)
- Secret Manager: ~$0.24 (4 secrets × $0.06)
- Network egress: ~$0.01
- **Total: Under $1/month**

## Monitoring

View function logs in Google Cloud Console:
1. Go to Cloud Functions
2. Click on function name
3. Go to "Logs" tab

Monitor usage and costs:
1. Go to Billing in Google Cloud Console
2. View detailed usage by service

## Security Best Practices

1. **Never log sensitive data** - Functions filter out credentials from logs
2. **Monitor for abuse** - Check logs for unusual rate limiting
3. **Rotate secrets periodically** - Update secrets in Secret Manager
4. **Review access logs** - Monitor who's using your functions

## Troubleshooting

### Common Issues

**Deployment fails with "API not enabled"**
```bash
# Enable required APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

**Functions return 401 Unauthorized**
- Check that secrets exist in Secret Manager
- Verify secret names match exactly
- Ensure billing is enabled

**Rate limiting errors**
- Normal behavior for high usage
- Increase limits in function code if needed

### Debug Mode
Set environment variable for verbose logging:
```bash
gcloud functions deploy FUNCTION_NAME --set-env-vars=DEBUG=true
```

## Next Steps

After deployment:
1. Update your Electron app to use these proxy URLs
2. Remove direct API credentials from your app code  
3. Test end-to-end functionality
4. Monitor usage and costs
