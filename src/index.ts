/**
 * CloudSignal WebSocket Client Library
 * 
 * Enterprise-grade MQTT client for CloudSignal platform.
 * 
 * @module @cloudsignal/cloudsignal-ws-client
 * @version 2.2.0
 * 
 * @example
 * // Basic usage
 * import CloudSignalClient from '@cloudsignal/cloudsignal-ws-client'
 * 
 * const client = new CloudSignalClient({ debug: true })
 * await client.connect({
 *   host: 'wss://connect.cloudsignal.app:18885/',
 *   username: 'user@org_abc123',
 *   password: 'token'
 * })
 * 
 * @example
 * // With V2 token authentication
 * const client = new CloudSignalClient({
 *   tokenServiceUrl: 'https://auth.cloudsignal.app',
 *   preset: 'desktop'
 * })
 * 
 * await client.connectWithToken({
 *   host: 'wss://connect.cloudsignal.app:18885/',
 *   organizationId: 'your-org-uuid',
 *   secretKey: 'cs_...',
 *   userEmail: 'user@example.com'
 * })
 * 
 * @example
 * // AI Agent with request/response
 * const client = new CloudSignalClient({
 *   preset: 'agent',
 *   enableRequestResponse: true
 * })
 * 
 * const response = await client.request('agent/query', { question: 'Hello?' })
 */

// Main client
export { 
  default as CloudSignalClient,
  CONNECTION_STATES,
} from './CloudSignalClient'

// Token management
export { 
  TokenManager,
  TOKEN_STATES,
  TOKEN_ERRORS,
  createTokenManager,
} from './TokenManager'

// Request/Response handler
export {
  RequestResponseHandler,
  REQUEST_STATES,
  createRequestResponseHandler,
} from './RequestResponse'

// Configuration
export { 
  DEFAULT_CONFIG,
  CONNECTION_OPTIONS,
  TOKEN_AUTH_OPTIONS,
} from './config/defaults'

export {
  PRESETS,
  MOBILE_PRESET,
  DESKTOP_PRESET,
  AGENT_PRESET,
  SERVER_PRESET,
  getPreset,
  mergeWithPreset,
} from './config/presets'

// Environment utilities
export {
  PLATFORMS,
  TRANSPORTS,
  isBrowser,
  isNode,
  isWebWorker,
  isReactNative,
  isAndroid,
  isIOS,
  isMobile,
  getPlatform,
  getDefaultTransport,
  supportsWebSocket,
  supportsNativeMqtt,
  getRecommendedPreset,
  getEnvironmentInfo,
} from './utils/environment'

// Logging utilities
export {
  LOG_LEVELS,
  Logger,
  createLogger,
  createDebugLogger,
} from './utils/logger'

// Correlation utilities
export {
  generateUUID,
  generateShortId,
  generateTimestampId,
  generateSequentialId,
  generateCorrelationId,
  CorrelationIdGenerator,
  createCorrelationIdGenerator,
  toBinaryCorrelationData,
  fromBinaryCorrelationData,
} from './utils/correlation'

// Default export
export { default } from './CloudSignalClient'

/**
 * Library version
 */
export const VERSION: string = '2.2.1'

// Re-export types
export type { ClientOptions, ConnectionConfig, TokenAuthConfig } from './CloudSignalClient'
