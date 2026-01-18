# CloudSignal WebSocket Client Library

Enterprise-grade MQTT client library for CloudSignal platform with V2 token authentication, AI agent communication patterns, and multi-platform support.

## Features

- **V2 Token Authentication** - Automatic token management with refresh scheduling
- **External IdP Support** - Supabase, Firebase, Auth0, Clerk, OIDC integration
- **AI Agent Patterns** - Request/response with MQTT 5 correlation
- **Multi-Transport** - WebSocket (wss://) and native MQTT (mqtts://)
- **Platform Presets** - Mobile, desktop, agent, and server configurations
- **Offline Queue** - Messages queued during disconnection
- **Auto-Reconnect** - Configurable reconnection with exponential backoff

## Service URLs

| Service | URL | Purpose |
|---------|-----|--------|
| Token Service | `https://auth.cloudsignal.app` | JWT exchange, token refresh |
| MQTT Broker | `wss://connect.cloudsignal.app:18885/` | WebSocket connection |
| REST Publisher | `https://rest-publisher.cloudsignal.app` | Server-side publish API |
| Dashboard | `https://dashboard.cloudsignal.app` | Web management console |

## Installation

### Browser (CDN)

```html
<!-- Latest version -->
<script src="https://cdn.cloudsignal.io/CloudSignalWS.js"></script>

<!-- Specific version (recommended for production) -->
<script src="https://cdn.cloudsignal.io/cloudsignal-mqtt.v2.2.0.js"></script>
```

### npm

```bash
npm install @cloudsignal/mqtt-client
```

## Quick Start

### Basic Connection

```javascript
import CloudSignal from '@cloudsignal/mqtt-client'

const client = new CloudSignal({ debug: true })

await client.connect({
  host: 'wss://connect.cloudsignal.app:18885/',
  username: 'user@org_abc123',
  password: 'your-token',
  clientId: 'my-client'
})

client.onMessage((topic, message) => {
  console.log('Received:', topic, message)
})

await client.subscribe('my/topic')
client.transmit('my/topic', { hello: 'world' })
```

### V2 Token Authentication

```javascript
const client = new CloudSignal({
  tokenServiceUrl: 'https://auth.cloudsignal.app',
  preset: 'desktop'
})

// Connect with automatic token management
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'your-org-uuid',
  secretKey: 'cs_live_xxxxx',
  userEmail: 'user@example.com',
  userName: 'John Doe'
})

// Token auto-refreshes before expiration
```

### External Identity Provider

```javascript
const client = new CloudSignal({
  tokenServiceUrl: 'https://auth.cloudsignal.app'
})

// Connect via Supabase (or Firebase, Auth0, Clerk)
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'your-org-uuid',
  externalToken: supabaseSession.access_token
})

// Note: 'idToken' is also supported as an alias for 'externalToken'
// The provider is auto-detected from your organization's configuration
```

### AI Agent Request/Response

```javascript
const client = new CloudSignal({
  preset: 'agent',
  enableRequestResponse: true
})

await client.connect({ /* ... */ })

// Send request and await response
const response = await client.request(
  'agents/assistant/query',
  { question: 'What is CloudSignal?' },
  { timeout: 30000 }
)
console.log('Agent response:', response)

// Handle incoming requests
client.onRequest(async (topic, payload, respond) => {
  const answer = await processQuery(payload.question)
  await respond({ answer })
})
```

### Mobile Optimization

```javascript
const client = new CloudSignal({
  preset: 'mobile',
  // Override specific settings
  keepalive: 30,
  offlineQueueEnabled: true
})
```

## API Reference

### Constructor

```javascript
new CloudSignal(options)
```

**Options:**

- `debug` (boolean): Enable verbose logging. Default: `false`
- `preset` (string): Platform preset ('mobile', 'desktop', 'agent', 'server')
- `autoDetectPlatform` (boolean): Auto-detect and apply optimal settings. Default: `false`
- `tokenServiceUrl` (string): CloudSignal token service URL (use `https://auth.cloudsignal.app`)
- `enableRequestResponse` (boolean): Enable request/response pattern. Default: `false`

**Connection Options:**
- `keepalive` (number): Keepalive interval in seconds. Default: `45`
- `connectTimeout` (number): Connection timeout in ms. Default: `30000`
- `reconnectPeriod` (number): Reconnect interval in ms. Default: `5000`
- `cleanSession` (boolean): Use clean session. Default: `false`
- `reconnectOnAuthError` (boolean): Retry connection on auth errors. Default: `false`
- `maxAuthRetries` (number): Max reconnect attempts for auth errors. Default: `0`

**Mobile Options:**
- `offlineQueueEnabled` (boolean): Queue messages when offline. Default: `false`
- `offlineQueueMaxSize` (number): Max queued messages. Default: `100`

### Connection Methods

#### `connect(config)`
Connect to CloudSignal MQTT broker with credentials.

```javascript
await client.connect({
  host: 'wss://connect.cloudsignal.app:18885/',
  username: 'user@org_id',
  password: 'token',
  clientId: 'optional-client-id',
  willTopic: 'status/user',       // Optional: Last will topic
  willMessage: 'offline',          // Optional: Last will message
  willQos: 1                       // Optional: Last will QoS
})
```

#### `connectWithToken(config)`
Connect using V2 token authentication.

```javascript
// Direct authentication
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'org-uuid',
  secretKey: 'cs_live_xxxxx',
  userEmail: 'user@example.com',
  userName: 'John Doe',            // Optional
  metadata: { role: 'admin' }      // Optional
})

// External IdP authentication (Supabase, Firebase, Auth0, Clerk)
await client.connectWithToken({
  host: 'wss://connect.cloudsignal.app:18885/',
  organizationId: 'org-uuid',
  externalToken: 'jwt-from-provider'  // Your IdP's access/ID token
})
// Note: 'idToken' is supported as an alias for backward compatibility
```

#### `disconnect()`
Disconnect from broker.

#### `destroy()`
Disconnect and cleanup all resources.

### Messaging Methods

#### `subscribe(topic, qos)`
Subscribe to a topic.

```javascript
await client.subscribe('my/topic', 1)  // QoS 1
await client.subscribe('data/#')        // Wildcard
```

#### `unsubscribe(topic)`
Unsubscribe from a topic.

```javascript
await client.unsubscribe('my/topic')
```

#### `transmit(topic, message, options)`
Publish a message.

```javascript
// Simple
client.transmit('topic', 'message')

// With options
client.transmit('topic', { data: 123 }, {
  qos: 1,
  retain: true,
  properties: {
    userProperties: { key: 'value' }
  }
})
```

#### `onMessage(callback)`
Register message handler.

```javascript
client.onMessage((topic, message, packet) => {
  console.log(topic, message)
  // packet contains MQTT 5 properties
})
```

### Request/Response Methods

Requires `enableRequestResponse: true` in constructor.

#### `request(topic, payload, options)`
Send request and await response.

```javascript
const response = await client.request(
  'service/endpoint',
  { action: 'query' },
  { timeout: 10000 }  // Optional timeout
)
```

#### `onRequest(handler)`
Handle incoming requests.

```javascript
client.onRequest(async (topic, payload, respond) => {
  const result = await processRequest(payload)
  await respond(result)
})
```

### State Methods

#### `isConnected()`
Returns connection state.

#### `getConnectionState()`
Returns detailed state: `'disconnected'`, `'connecting'`, `'connected'`, `'reconnecting'`

#### `getSubscriptions()`
Returns Set of active subscriptions.

#### `getConfig()`
Returns current configuration.

### Event Callbacks

```javascript
client.onConnectionStatusChange = (isConnected) => { }
client.onOffline = () => { }
client.onOnline = () => { }
client.onReconnecting = (attempt) => { }
client.onAuthError = (error) => {
  // Called on authentication failures
  // By default, reconnect attempts are stopped on auth errors
  // Use reconnectOnAuthError: true to override
}
```

## Platform Presets

### Mobile
Optimized for battery and intermittent connectivity.

```javascript
new CloudSignal({ preset: 'mobile' })
// keepalive: 30s, offlineQueue: enabled, reconnectPeriod: 3s
```

### Desktop
Balanced for desktop applications.

```javascript
new CloudSignal({ preset: 'desktop' })
// keepalive: 45s, reconnectPeriod: 5s
```

### Agent
Optimized for AI agents and bots.

```javascript
new CloudSignal({ preset: 'agent' })
// keepalive: 60s, enableRequestResponse: true
```

### Server
Optimized for server-side usage.

```javascript
new CloudSignal({ preset: 'server' })
// keepalive: 120s, cleanSession: true
```

## Node.js Usage

For Node.js with native MQTT (mqtts://):

```javascript
const { CloudSignal } = require('@cloudsignal/cloudsignal-ws-client')

const client = new CloudSignal({
  transport: 'mqtt',  // Use native MQTT instead of WebSocket
  preset: 'server'
})

await client.connect({
  host: 'mqtts://connect.cloudsignal.app:8883/',
  username: 'user@org',
  password: 'token'
})
```

## Development

```bash
npm install
npm run build:watch  # Watch mode
npm run build        # Production build
```

### Build Output

- `cdn/CloudSignalWS.js` - Browser bundle (latest)
- `cdn/CloudSignalWS.v2.0.0.js` - Versioned browser bundle
- `dist/CloudSignal.node.js` - Node.js bundle

## Examples

See the `examples/` directory for complete integrations:

- **[Next.js + Supabase](./examples/nextjs-supabase/)** - Full React integration with token refresh and context provider
- **[React Hooks](./examples/react-hooks/)** - Standalone React hooks for any React project
- **[React Native](./examples/react-native/)** - Mobile app integration with mobile preset
- **[Node.js Server](./examples/node-server/)** - Server-side MQTT for background jobs and microservices
- **[Vanilla JavaScript](./examples/vanilla-js/)** - No-build HTML + script tag example for CDN usage

## Troubleshooting

See **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** for solutions to common issues:

- Authentication errors and token expiry
- React StrictMode double-connection issues  
- Infinite reconnect loops
- WebSocket connection problems

## Migration from v1.x

See [MIGRATION.md](./MIGRATION.md) for upgrade guide.

**Breaking changes:**
- Constructor signature changed from boolean to options object
- `transmit()` third parameter is now options object
- Mobile optimizations require explicit preset or `autoDetectPlatform: true`

## License

MIT

