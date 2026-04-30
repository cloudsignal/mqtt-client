# Migration Guide: v1.x to v2.0

This guide covers breaking changes and migration steps for upgrading from CloudSignal WebSocket Client v1.x to v2.0.

## Quick Summary

| Change | v1.x | v2.0 |
|--------|------|------|
| Constructor | `new CloudSignalClient(true)` | `new CloudSignalClient({ debug: true })` |
| transmit() | `transmit(topic, msg, qos)` | `transmit(topic, msg, { qos, retain })` |
| Mobile optimization | Automatic | Explicit preset required |
| Token auth | Not supported | Full V2 support |

## Breaking Changes

### 1. Constructor Signature

**v1.x:**
```javascript
// Boolean parameter for development mode
const client = new CloudSignalClient(true)  // Enable debug logging
const client = new CloudSignalClient(false) // Disable debug logging
```

**v2.0:**
```javascript
// Options object with named parameters
const client = new CloudSignalClient({ debug: true })
const client = new CloudSignalClient({ debug: false })

// With additional options
const client = new CloudSignalClient({
  debug: true,
  preset: 'mobile',
  tokenServiceUrl: 'https://connect.cloudsignal.app'
})
```

**Migration:**
```javascript
// Before
const client = new CloudSignalClient(true)

// After
const client = new CloudSignalClient({ debug: true })
```

> **Backward Compatibility:** v2.0 still accepts boolean for backward compatibility, but this is deprecated and will be removed in v3.0.

### 2. transmit() Method Signature

**v1.x:**
```javascript
// QoS as third positional parameter
client.transmit('topic', message, 1)
```

**v2.0:**
```javascript
// Options object with qos, retain, properties
client.transmit('topic', message, { qos: 1 })

// With additional options
client.transmit('topic', message, {
  qos: 1,
  retain: true,
  properties: {
    userProperties: { key: 'value' }
  }
})
```

**Migration:**
```javascript
// Before
client.transmit('my/topic', payload, 1)

// After
client.transmit('my/topic', payload, { qos: 1 })
```

> **Backward Compatibility:** v2.0 still accepts number as third parameter for backward compatibility.

### 3. Mobile Optimizations

**v1.x:**
Mobile optimizations (offline queue, shorter keepalive) were applied automatically based on user agent detection.

**v2.0:**
Mobile optimizations must be explicitly enabled via preset or auto-detection.

**Migration:**
```javascript
// Option 1: Use mobile preset
const client = new CloudSignalClient({ preset: 'mobile' })

// Option 2: Enable auto-detection
const client = new CloudSignalClient({ autoDetectPlatform: true })

// Option 3: Configure manually
const client = new CloudSignalClient({
  keepalive: 30,
  offlineQueueEnabled: true,
  reconnectPeriod: 3000
})
```

## New Features in v2.0

### V2 Token Authentication

Connect using CloudSignal V2 token API with automatic refresh:

```javascript
const client = new CloudSignalClient({
  tokenServiceUrl: 'https://connect.cloudsignal.app'
})

await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'your-org-uuid',
  secretKey: 'cs_live_xxxxx',
  userEmail: 'user@example.com'
})
```

### External Identity Provider Support

Connect via Supabase, Firebase, Auth0, Clerk, or OIDC:

```javascript
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'your-org-uuid',
  provider: 'supabase',
  idToken: supabaseUser.access_token
})
```

### AI Agent Request/Response Pattern

Send requests and await responses using MQTT 5 correlation:

```javascript
const client = new CloudSignalClient({
  enableRequestResponse: true
})

const response = await client.request('agent/query', { question: 'Hello?' })
```

### Platform Presets

Pre-configured settings for different platforms:

```javascript
// Mobile - optimized for battery and intermittent connectivity
new CloudSignalClient({ preset: 'mobile' })

// Desktop - balanced settings
new CloudSignalClient({ preset: 'desktop' })

// Agent - optimized for AI agents
new CloudSignalClient({ preset: 'agent' })

// Server - optimized for server-side
new CloudSignalClient({ preset: 'server' })
```

### New Methods

- `unsubscribe(topic)` - Unsubscribe from topics
- `getSubscriptions()` - Get active subscriptions
- `getConnectionState()` - Get detailed connection state
- `getConfig()` - Get current configuration
- `destroy()` - Clean disconnect and resource cleanup

### New Callbacks

```javascript
client.onReconnecting = (attempt) => { }
client.onAuthError = (error) => { }
```

## Deprecated Features

- **Boolean constructor parameter**: Use `{ debug: true }` instead
- **Number as transmit QoS parameter**: Use `{ qos: 1 }` instead
- **V1 token endpoints**: Only V2 token API is supported

## Step-by-Step Migration

### Step 1: Update Constructor

```javascript
// Before
const client = new CloudSignalClient(isDev)

// After
const client = new CloudSignalClient({ debug: isDev })
```

### Step 2: Update transmit Calls

```javascript
// Before
client.transmit(topic, message, qos)

// After
client.transmit(topic, message, { qos })
```

### Step 3: Enable Mobile Optimizations (if needed)

```javascript
// Add preset if your app runs on mobile
const client = new CloudSignalClient({
  debug: isDev,
  preset: 'mobile'  // or autoDetectPlatform: true
})
```

### Step 4: Consider Token Authentication (optional)

If you want automatic token management:

```javascript
const client = new CloudSignalClient({
  tokenServiceUrl: 'https://connect.cloudsignal.app'
})

// Replace connect() with connectWithToken()
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'your-org-uuid',
  secretKey: 'cs_live_xxxxx',
  userEmail: 'user@example.com'
})
```

## Version Compatibility

| Feature | v1.x | v2.0 |
|---------|------|------|
| Basic MQTT | ✅ | ✅ |
| WebSocket transport | ✅ | ✅ |
| Native MQTT transport | ❌ | ✅ |
| V2 Token Auth | ❌ | ✅ |
| External IdP | ❌ | ✅ |
| Request/Response | ❌ | ✅ |
| Platform presets | ❌ | ✅ |
| Retain messages | ❌ | ✅ |
| MQTT 5 properties | Partial | ✅ |
| Unsubscribe | ❌ | ✅ |

## Getting Help

If you encounter issues during migration:

1. Check this guide for common migration patterns
2. Review the [README.md](./README.md) for v2.0 API documentation
3. Open an issue on GitHub

## Changelog

See [version.md](./version.md) for detailed release notes.
