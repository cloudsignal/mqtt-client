# CloudSignal WebSocket Client Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2025-01-15

### Added

- **Documentation Examples**: Added comprehensive example implementations
  - Next.js + Supabase integration with React context and hooks
  - Standalone React hooks for any React project
  - React Native mobile example with mobile preset
  - Node.js server example for backend services
  - Vanilla JavaScript example for CDN/no-build usage
- **Troubleshooting Guide**: New TROUBLESHOOTING.md with solutions for common issues

### Changed

- Updated README Examples section with links to all examples

## [2.2.0] - 2025-01-14

### Added

- **Auth Error Handling**: New `reconnectOnAuthError` option (default: `false`) to control reconnect behavior on authentication failures
- **Auth Retry Limit**: New `maxAuthRetries` option to limit reconnect attempts specifically for auth errors
- **TypeScript Declarations**: Added example type definitions in documentation (full `.d.ts` generation pending strict type annotations)

### Fixed

- **Infinite Reconnect Loop**: Fixed issue where SDK would endlessly retry connection with expired/invalid tokens. Now stops reconnect attempts on auth errors by default.
- **idToken Parameter**: Added `idToken` as an alias for `externalToken` for backward compatibility with documentation examples
- **Auth Error Detection**: Improved detection of auth errors to include "Bad User Name or Password" messages

### Changed

- **Documentation**: Updated README with correct service URLs table
- **Token Service URL**: Documentation now correctly shows `https://auth.cloudsignal.app` as the token service URL
- **External IdP Examples**: Updated to use `externalToken` parameter with note about `idToken` alias

### Developer Notes

- Removed `.js` extensions from internal TypeScript imports
- Synchronized version strings across all source files

## [2.1.0] - 2025-01-09

### Changed

- **Build System**: Migrated from Webpack to tsup for faster builds (10-100x improvement)
- **Source Code**: Converted from JavaScript to TypeScript
- **Output Formats**: Now produces ESM (.js), CJS (.cjs), and IIFE (.global.js) bundles
- **Package Structure**: Simplified exports configuration
- **npm Publishing**: Added automated npm publishing via GitHub Actions

### Added

- TypeScript source files in `src/`
- `tsup.config.ts` for build configuration
- `tsconfig.json` for TypeScript configuration
- npm publish step in CI/CD pipeline
- unpkg/jsdelivr CDN support via npm

### Removed

- Webpack configuration files
- Babel configuration
- `build-versioned.js` script

### Note

TypeScript type definitions (.d.ts) are temporarily disabled and will be enabled in a future patch release once type annotations are complete.

## [2.0.0] - 2025-01-09

### Added

#### V2 Token Authentication
- `TokenManager` class for V2 token lifecycle management
- `connectWithToken()` method for token-based authentication
- Automatic token refresh scheduling based on `refresh_recommended_at`
- Support for `/v2/tokens/create`, `/v2/tokens/exchange`, `/v2/tokens/refresh` endpoints
- Token state callbacks (`onTokenRefreshed`, `onTokenError`, `onTokenExpiring`)

#### External Identity Provider Support
- Supabase integration via token exchange
- Firebase integration via token exchange
- Auth0 integration via token exchange
- Clerk integration via token exchange
- Generic OIDC provider support

#### AI Agent Communication
- `RequestResponseHandler` class for request/response patterns
- `request(topic, payload, options)` method with timeout support
- `onRequest(handler)` for handling incoming requests
- MQTT 5 correlation data for request/response tracking
- Response topic management
- User properties support for metadata

#### Platform Presets
- `mobile` preset - optimized for battery and intermittent connectivity
- `desktop` preset - balanced settings for desktop apps
- `agent` preset - optimized for AI agents and bots
- `server` preset - optimized for server-side usage
- `autoDetectPlatform` option for automatic preset selection

#### Connection Enhancements
- `unsubscribe(topic)` method
- `getSubscriptions()` method returns active subscriptions
- `getConnectionState()` for detailed state ('disconnected', 'connecting', 'connected', 'reconnecting')
- `getConfig()` returns current configuration
- `destroy()` method for complete cleanup

#### Publishing Enhancements
- `retain` option in `transmit()` method
- MQTT 5 `properties` support (userProperties, payloadFormatIndicator, etc.)
- Options object pattern for transmit: `transmit(topic, msg, { qos, retain, properties })`

#### Configuration System
- Centralized defaults in `src/config/defaults.js`
- Platform presets in `src/config/presets.js`
- Environment detection utilities in `src/utils/environment.js`
- Configurable logging with `src/utils/logger.js`
- Correlation ID generation utilities

#### Build System
- Dual build targets: browser (wss://) and Node.js (mqtts://)
- `npm run build:browser` - webpack browser build
- `npm run build:node` - webpack Node.js build
- Conditional exports in package.json for ESM/CJS

#### New Callbacks
- `onReconnecting(attempt)` - called during reconnection attempts
- `onAuthError(error)` - called on authentication failures

### Changed

- **BREAKING**: Constructor signature changed from boolean to options object
  - Before: `new CloudSignalClient(true)`
  - After: `new CloudSignalClient({ debug: true })`
- **BREAKING**: `transmit()` third parameter changed from number to options object
  - Before: `transmit(topic, msg, 1)`
  - After: `transmit(topic, msg, { qos: 1 })`
- **BREAKING**: Mobile optimizations now require explicit preset or `autoDetectPlatform: true`
- Entry point changed from `CloudSignalClient.js` to `index.js`
- Package version updated to 2.0.0

### Deprecated

- Boolean parameter in constructor (backward compatible but deprecated)
- Number as third parameter in transmit() (backward compatible but deprecated)

### Removed

- V1 token endpoint support (only V2 API is supported)

### Backward Compatibility

The following patterns are still supported but deprecated:

```javascript
// Deprecated but still works
const client = new CloudSignalClient(true)
client.transmit('topic', msg, 1)

// Recommended
const client = new CloudSignalClient({ debug: true })
client.transmit('topic', msg, { qos: 1 })
```

## [1.0.2] - Previous Release

- Initial stable release
- Basic MQTT over WebSocket support
- Auto-reconnect functionality
- Message queuing during reconnection
- Mobile user agent detection

---

## Migration

See [MIGRATION.md](./MIGRATION.md) for detailed upgrade instructions from v1.x to v2.0.
