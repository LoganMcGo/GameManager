# Secure Client Credentials Solution

This document explains how we've implemented a secure solution for embedding client credentials in your game manager app without exposing them directly to users.

## Problem Statement

The original challenge was: "How can we get my client id and client secret embedded in the app so users don't have to enter them themselves, but do it safely so that they are not actually in the app?"

## Solution Overview

We've implemented a **proxy architecture** using Google Cloud Functions that keeps your sensitive credentials secure while providing seamless access to external APIs. Here's how it works:

### Architecture

```
[Game Manager App] → [Cloud Functions (Proxy)] → [External APIs]
                      ↑
                   [Google Secret Manager]
                   (Stores credentials securely)
```

## Deployed Cloud Functions

### 1. Key Generator Function
- **URL**: `https://us-central1-gamemanagerproxy.cloudfunctions.net/key-generator`
- **Purpose**: Generates JWT tokens for authenticating requests to proxy functions
- **Security**: Uses machine fingerprinting to ensure tokens are tied to specific devices

### 2. IGDB Proxy Function
- **URL**: `https://us-central1-gamemanagerproxy.cloudfunctions.net/igdb-proxy`
- **Purpose**: Proxies requests to the IGDB API using your stored credentials
- **Features**:
  - Automatic token generation and refresh for IGDB API
  - Rate limiting (60 requests per minute per machine)
  - JWT authentication required

### 3. Real-Debrid Proxy Function
- **URL**: `https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy`
- **Purpose**: Proxies requests to Real-Debrid API
- **Features**:
  - Secure credential handling
  - JWT authentication required
  - CORS support for web applications

## Security Features

### 1. **No Credentials in Client Code**
- Your IGDB client ID/secret and other sensitive credentials are stored in Google Secret Manager
- The client application never sees or handles these credentials directly

### 2. **JWT Authentication**
- All proxy requests require valid JWT tokens
- Tokens are generated using machine fingerprinting
- Tokens have expiration times for additional security

### 3. **Rate Limiting**
- Built-in rate limiting prevents abuse
- Limits are enforced per machine to prevent one user from affecting others

### 4. **CORS Protection**
- Proper CORS headers ensure requests can only come from authorized origins
- Preflight request handling for complex requests

### 5. **Google Cloud Security**
- Leverages Google Cloud's enterprise-grade security
- Secret Manager provides encrypted storage for sensitive data
- Cloud Functions run in isolated environments

## How It Works

### For IGDB API Access:

1. **Initial Setup**: Your app requests a JWT token from the key-generator function
2. **API Requests**: Your app makes requests to the IGDB proxy function with the JWT token
3. **Credential Handling**: The proxy function retrieves your IGDB credentials from Secret Manager
4. **Token Management**: The proxy automatically handles IGDB access token generation and refresh
5. **Response**: The proxy forwards the IGDB API response back to your app

### For Real-Debrid API Access:

1. **Authentication**: Your app uses the same JWT token system
2. **API Requests**: Requests go to the Real-Debrid proxy function
3. **User Credentials**: Users still provide their own Real-Debrid API tokens (this is user-specific data)
4. **Proxy**: The function forwards requests to Real-Debrid with proper authentication

## Implementation in Your App

### 1. Get JWT Token
```javascript
const response = await fetch('https://us-central1-gamemanagerproxy.cloudfunctions.net/key-generator', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    machine_id: 'unique-machine-identifier',
    app_name: 'GameManager'
  })
});
const { token } = await response.json();
```

### 2. Use IGDB Proxy
```javascript
const igdbResponse = await fetch('https://us-central1-gamemanagerproxy.cloudfunctions.net/igdb-proxy/games', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'text/plain'
  },
  body: 'fields name,cover.url; where rating > 80; limit 10;'
});
```

### 3. Use Real-Debrid Proxy
```javascript
const rdResponse = await fetch('https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    apiToken: 'user-real-debrid-token',
    endpoint: '/user',
    method: 'GET'
  })
});
```

## Benefits

1. **Security**: Credentials never leave Google Cloud's secure environment
2. **Simplicity**: Users don't need to obtain or enter API credentials
3. **Reliability**: Automatic token refresh and error handling
4. **Scalability**: Cloud Functions automatically scale based on demand
5. **Cost-Effective**: Pay only for actual usage
6. **Maintainability**: Centralized credential management

## Next Steps

To integrate this solution into your game manager app:

1. **Update your services**: Modify `igdbService.js` and `realDebridService.js` to use the proxy endpoints
2. **Implement JWT handling**: Add token generation and management to your app
3. **Update authentication flow**: Remove credential input requirements for IGDB
4. **Test thoroughly**: Ensure all API calls work through the proxy functions

## Monitoring and Maintenance

- Monitor function logs in Google Cloud Console
- Set up alerts for function errors or high usage
- Regularly rotate secrets in Secret Manager
- Update function code as needed for API changes

This solution provides enterprise-grade security while maintaining ease of use for your application users.
