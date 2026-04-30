# CloudSignal SDK Troubleshooting Guide

This guide covers common issues and their solutions when integrating the CloudSignal MQTT SDK.

## Table of Contents

- [Authentication Errors](#authentication-errors)
- [Connection Issues](#connection-issues)
- [React/Next.js Issues](#reactnextjs-issues)
- [Token Management](#token-management)
- [Message Delivery](#message-delivery)
- [Debug Mode](#debug-mode)

---

## Authentication Errors

### "Bad User Name or Password" / "Not authorized"

**Symptoms:**
- Connection fails immediately with auth error
- Error message contains "Bad User Name or Password" or "Not authorized"

**Common Causes & Solutions:**

1. **Expired Token**
   
   If using external IdP (Supabase, Firebase, etc.), your JWT may have expired.
   
   ```javascript
   // SDK v2.2.0+ stops reconnect on auth errors automatically
   client.onAuthError = (error) => {
     console.error("Auth failed:", error);
     // Get fresh token from your IdP and reconnect
     const newToken = await refreshYourIdPToken();
     client.destroy();
     // Create new client with fresh token
   };
   ```

2. **Wrong Token Service URL**
   
   Make sure you're using the correct URL:
   ```javascript
   // ✅ Correct
   tokenServiceUrl: "https://auth.cloudsignal.app"
   
   // ❌ Wrong - these won't work
   tokenServiceUrl: "https://connect.cloudsignal.app"
   tokenServiceUrl: "https://api.cloudsignal.app"
   ```

3. **Invalid Organization ID**
   
   Ensure your `organizationId` matches the UUID in your CloudSignal dashboard.

4. **Supabase Integration Not Configured**
   
   If using Supabase, verify the integration is enabled in CloudSignal dashboard under Organization Settings → Integrations.

### "Token exchange failed" / 422 Error

**Symptoms:**
- `connectWithToken()` throws error
- Server returns 422 Unprocessable Entity

**Solutions:**

1. **Check Token Service Version**
   
   The SDK v2.x requires a token service that supports `/v2/tokens/exchange`. Contact support if you see v1 endpoint errors.

2. **Verify JWT Format**
   
   Ensure you're passing the access token, not the refresh token:
   ```javascript
   // ✅ Correct - access_token
   externalToken: session.access_token
   
   // ❌ Wrong - refresh token
   externalToken: session.refresh_token
   ```

---

## Connection Issues

### Infinite Reconnect Loop

**Symptoms:**
- Console shows repeated "Reconnect attempt #X" messages
- Connection never succeeds
- High CPU/network usage

**Solution (SDK v2.2.0+):**

The SDK now stops reconnect attempts on auth errors by default. If you're seeing this on older versions, upgrade or add manual handling:

```javascript
// Pre-v2.2.0 workaround
client.onAuthError = (error) => {
  client.destroy(); // Stop the reconnect loop
  clientRef.current = null;
};
```

If you want the old behavior (keep retrying):
```javascript
const client = new CloudSignal({
  reconnectOnAuthError: true,  // Opt-in to retry on auth errors
  maxAuthRetries: 5,           // Limit attempts
});
```

### Connection Timeout

**Symptoms:**
- `connect()` never resolves
- Error: "Connection timeout"

**Solutions:**

1. **Check WebSocket URL**
   ```javascript
   // ✅ Correct - note the port and trailing slash
   host: "wss://connect.cloudsignal.app:18885/"
   
   // ❌ Missing port
   host: "wss://connect.cloudsignal.app/"
   ```

2. **Firewall/Proxy Issues**
   
   Port 18885 must be accessible. Some corporate networks block non-standard ports.

3. **Increase Timeout**
   ```javascript
   const client = new CloudSignal({
     connectTimeout: 60000,  // 60 seconds
   });
   ```

### WebSocket Connection Failed

**Symptoms:**
- Browser console shows WebSocket connection error
- Works on some networks but not others

**Solutions:**

1. **Check HTTPS/WSS**
   
   Secure pages (HTTPS) can only connect to secure WebSockets (WSS).

2. **CORS Issues**
   
   CloudSignal's broker allows all origins, but ensure you're not adding custom headers that trigger CORS preflight.

---

## React/Next.js Issues

### Double Connection in Development (StrictMode)

**Symptoms:**
- Two connections appear briefly in development
- "Already connected" warnings
- Works fine in production

**Cause:**

React 18's StrictMode intentionally double-mounts components to help find bugs.

**Solution:**

Use connection guards (see `examples/nextjs-supabase/hooks/use-mqtt.ts`):

```javascript
const clientRef = useRef(null);
const connectingRef = useRef(false);
const mountedRef = useRef(true);

useEffect(() => {
  mountedRef.current = true;

  const connect = async () => {
    // Guard: prevent concurrent connections
    if (connectingRef.current || clientRef.current) {
      return;
    }
    connectingRef.current = true;

    try {
      const client = new CloudSignal({...});
      await client.connectWithToken({...});

      // Check if still mounted after async operation
      if (!mountedRef.current) {
        client.destroy();
        return;
      }

      clientRef.current = client;
    } finally {
      connectingRef.current = false;
    }
  };

  connect();

  return () => {
    mountedRef.current = false;
    clientRef.current?.destroy();
    clientRef.current = null;
  };
}, []);
```

### Memory Leak Warning

**Symptoms:**
- React warns about state updates on unmounted component
- "Can't perform a React state update on an unmounted component"

**Solution:**

Always check if component is mounted before updating state:

```javascript
client.onConnectionStatusChange = (connected) => {
  if (mountedRef.current) {
    setIsConnected(connected);
  }
};
```

### Client Not Available in SSR

**Symptoms:**
- Error during server-side rendering
- "window is not defined"

**Solution:**

The SDK requires a browser environment. Use dynamic imports or guards:

```javascript
// Option 1: Dynamic import
const CloudSignal = dynamic(() => import("@cloudsignal/mqtt-client"), {
  ssr: false,
});

// Option 2: Guard in useEffect (runs only in browser)
useEffect(() => {
  const CloudSignal = require("@cloudsignal/mqtt-client").default;
  // ... use CloudSignal
}, []);
```

---

## Token Management

### Token Expires During Long Session

**Symptoms:**
- Connection works initially, then fails after ~1 hour
- Auth errors appear without user action

**Solution:**

Listen for token refresh events from your IdP:

```javascript
// Supabase example
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED" && session) {
    // Reconnect with new token
    client.destroy();
    connectWithNewToken(session.access_token);
  }
});
```

### Token Refresh Race Condition

**Symptoms:**
- Intermittent auth failures during token refresh
- "Token already refreshing" errors

**Solution:**

Use a connection lock:

```javascript
const isRefreshing = useRef(false);

const handleTokenRefresh = async (newToken) => {
  if (isRefreshing.current) return;
  isRefreshing.current = true;
  
  try {
    client.destroy();
    await connectWithNewToken(newToken);
  } finally {
    isRefreshing.current = false;
  }
};
```

---

## Message Delivery

### Messages Not Received

**Symptoms:**
- `publish()` succeeds but `onMessage` never fires
- Other clients receive messages

**Solutions:**

1. **Check Subscription**
   ```javascript
   // Ensure you're subscribed before expecting messages
   await client.subscribe("my/topic");
   
   // Check active subscriptions
   console.log(client.getSubscriptions());
   ```

2. **Check Topic Wildcards**
   ```javascript
   // MQTT wildcards
   "sensors/+"      // Single level: matches sensors/temp, sensors/humidity
   "sensors/#"      // Multi level: matches sensors/room1/temp, sensors/a/b/c
   
   // Note: You can't publish to wildcard topics
   ```

3. **QoS Mismatch**
   
   If the publisher uses QoS 0, messages may be lost on unreliable networks.

### Messages Delayed

**Symptoms:**
- Messages arrive late (seconds to minutes)
- Real-time experience is poor

**Solutions:**

1. **Reduce Keepalive**
   ```javascript
   const client = new CloudSignal({
     keepalive: 30,  // More frequent pings (default is 60)
   });
   ```

2. **Check Network**
   
   Mobile networks with high latency will cause delays.

---

## Debug Mode

### Enabling Debug Logs

```javascript
const client = new CloudSignal({
  debug: true,  // Logs all SDK operations
});
```

### What Debug Mode Shows

- Connection state changes
- Token operations (create, exchange, refresh)
- Subscription/unsubscription events
- Message publish/receive
- Reconnection attempts
- Error details

### Filtering Logs

Debug logs are prefixed with `[CloudSignal]`. In browser console:

```javascript
// Filter to only CloudSignal logs
// Chrome DevTools: Filter by "[CloudSignal]"
```

### Production Considerations

**Never enable debug mode in production** - it may log sensitive information and affects performance.

```javascript
const client = new CloudSignal({
  debug: process.env.NODE_ENV === "development",
});
```

---

## Clerk Integration

### Token Expiry Causes Reconnect Loop

**Symptoms:**
- SDK keeps trying to reconnect with the same expired token
- Auth errors repeat in console

**Solution:**

The SDK's internal reconnect uses the original token. For Clerk (and other external IdPs), you need to:

1. Set `reconnectOnAuthError: false` (default in v2.2.0+)
2. Handle auth errors by destroying the client and reconnecting with a fresh token

```typescript
// Create client with auth error handling disabled
const client = new CloudSignal({
  reconnectOnAuthError: false,  // Don't retry with stale token
});

client.onAuthError = async (error) => {
  console.log("Auth error, getting fresh token...");
  
  // Destroy current client
  client.destroy();
  
  // Wait a moment
  await new Promise(r => setTimeout(r, 3000));
  
  // Get fresh token from Clerk
  const freshToken = await getToken();
  
  // Create new connection
  const newClient = new CloudSignal({ /* ... */ });
  await newClient.connectWithToken({
    host: "wss://connect.cloudsignal.app:18885/",
    organizationId: "your-org",
    externalToken: freshToken,
  });
};
```

See `examples/nextjs-clerk/` for a complete implementation.

### Clerk JWT Template Missing Email Claim

**Symptoms:**
- Token exchange fails with 422 error
- "email claim required" error

**Solution:**

In Clerk Dashboard → JWT Templates, ensure your template includes the `email` claim:

```json
{
  "email": "{{user.primary_email_address}}",
  "user_id": "{{user.id}}"
}
```

### JWKS URL Not Configured

**Symptoms:**
- Token validation fails
- "Unable to verify JWT" error

**Solution:**

In CloudSignal Dashboard, configure the Clerk JWKS URL:

```
https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json
```

---

## Still Having Issues?

1. **Check the examples** in `examples/` for working implementations
2. **Search existing issues** on GitHub
3. **Open a new issue** with:
   - SDK version (`npm list @cloudsignal/mqtt-client`)
   - Framework and version (Next.js 15, React 18, etc.)
   - Minimal reproduction code
   - Full error message with stack trace
   - Debug mode output (sanitize any tokens)
