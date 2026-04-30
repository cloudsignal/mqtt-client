/**
 * CloudSignal WebSocket Client - Platform Presets
 * 
 * Pre-configured settings optimized for different deployment environments.
 * Use these as starting points and override specific values as needed.
 * 
 * @module config/presets
 */

/**
 * Mobile preset - Optimized for Android and iOS devices
 * 
 * Characteristics:
 * - Uses MQTT v3.1.1 (v4) for broader compatibility
 * - Slower reconnection to conserve battery
 * - Persistent sessions for offline message delivery
 * - Staggered operations for stability on unreliable networks
 * 
 * @type {Object}
 */
export const MOBILE_PRESET = {
  // Connection
  protocolVersion: 4,           // MQTT 3.1.1 for better Android compatibility
  keepalive: 60,                // Standard keepalive
  reconnectPeriod: 10000,       // 10s - slower to conserve battery
  connectTimeout: 30000,        // 30s - allow for slow networks
  cleanSession: false,          // Persistent sessions for offline messages
  
  // Reconnection
  maxReconnectAttempts: 50,     // More attempts for mobile
  reconnectBackoff: true,
  maxReconnectDelay: 120000,    // Up to 2 minutes between attempts
  reconnectBackoffMultiplier: 2.0,
  
  // Mobile-specific stability
  postConnectDelay: 500,        // 500ms delay after connect
  resubscribeDelay: 200,        // 200ms between resubscriptions
  staggeredResubscribe: true,
  
  // Offline handling
  enableOfflineQueue: true,
  maxOfflineQueueSize: 500,     // Limited for memory constraints
  dropOldestOnQueueFull: true,
  
  // QoS defaults (reliable delivery)
  defaultSubscribeQos: 1,
  defaultPublishQos: 1,
}

/**
 * Desktop preset - Standard browser settings
 * 
 * Characteristics:
 * - Uses MQTT v5 for full feature support
 * - Fast reconnection for better UX
 * - Balanced settings for typical web applications
 * 
 * @type {Object}
 */
export const DESKTOP_PRESET = {
  // Connection
  protocolVersion: 5,           // MQTT 5.0 for full features
  keepalive: 60,
  reconnectPeriod: 5000,        // 5s - fast reconnection
  connectTimeout: 30000,
  cleanSession: false,          // Persistent sessions
  
  // Reconnection
  maxReconnectAttempts: 50,
  reconnectBackoff: true,
  maxReconnectDelay: 60000,     // Up to 1 minute
  reconnectBackoffMultiplier: 1.5,
  
  // No special delays needed
  postConnectDelay: 0,
  resubscribeDelay: 100,
  staggeredResubscribe: true,
  
  // Offline handling
  enableOfflineQueue: true,
  maxOfflineQueueSize: 1000,
  dropOldestOnQueueFull: true,
  
  // QoS defaults
  defaultSubscribeQos: 1,
  defaultPublishQos: 0,
}

/**
 * Agent preset - Optimized for AI agents and automated systems
 * 
 * Characteristics:
 * - MQTT v5 required for request/response pattern
 * - Very fast reconnection for reliability
 * - Request/response enabled by default
 * - Timestamps and sender IDs for tracing
 * 
 * @type {Object}
 */
export const AGENT_PRESET = {
  // Connection
  protocolVersion: 5,           // Required for request/response
  keepalive: 30,                // Shorter keepalive for faster detection
  reconnectPeriod: 2000,        // 2s - aggressive reconnection
  connectTimeout: 15000,        // 15s - fail fast
  cleanSession: false,          // Persistent for message recovery
  
  // Reconnection
  maxReconnectAttempts: 100,    // More attempts for critical systems
  reconnectBackoff: true,
  maxReconnectDelay: 30000,     // Up to 30s
  reconnectBackoffMultiplier: 1.5,
  
  // No delays
  postConnectDelay: 0,
  resubscribeDelay: 50,         // Fast resubscription
  staggeredResubscribe: true,
  
  // AI Agent features
  enableRequestResponse: true,
  requestTimeout: 30000,        // 30s default for requests
  includeTimestamps: true,
  includeSenderId: true,
  
  // MQTT 5 features
  messageExpiryInterval: 300,   // 5 minute message expiry
  payloadFormatIndicator: 1,    // UTF-8/JSON payloads
  
  // Offline handling
  enableOfflineQueue: true,
  maxOfflineQueueSize: 5000,    // Larger queue for burst handling
  dropOldestOnQueueFull: false, // Drop new messages (preserve order)
  
  // QoS defaults (reliable)
  defaultSubscribeQos: 1,
  defaultPublishQos: 1,
}

/**
 * Server preset - Optimized for Node.js backend services
 * 
 * Characteristics:
 * - Uses mqtts:// transport (TLS)
 * - No platform auto-detection
 * - Aggressive reconnection
 * - High throughput settings
 * 
 * @type {Object}
 */
export const SERVER_PRESET = {
  // Connection
  protocolVersion: 5,
  keepalive: 30,                // Shorter for server reliability
  reconnectPeriod: 1000,        // 1s - very fast reconnection
  connectTimeout: 10000,        // 10s - fail fast
  cleanSession: false,
  
  // Reconnection
  maxReconnectAttempts: 0,      // Unlimited - servers should always reconnect
  reconnectBackoff: true,
  maxReconnectDelay: 30000,
  reconnectBackoffMultiplier: 1.5,
  
  // No delays
  postConnectDelay: 0,
  resubscribeDelay: 0,          // Immediate resubscription
  staggeredResubscribe: false,  // No staggering needed
  
  // Platform
  autoDetectPlatform: false,    // No auto-detection for servers
  
  // Transport
  transport: 'mqtts',           // TLS by default for servers
  rejectUnauthorized: true,
  
  // AI Agent features (can be enabled per-use)
  enableRequestResponse: false,
  requestTimeout: 60000,        // 60s for server operations
  
  // MQTT 5 features
  messageExpiryInterval: 0,     // No expiry by default
  payloadFormatIndicator: 1,
  
  // Offline handling
  enableOfflineQueue: true,
  maxOfflineQueueSize: 10000,   // Large queue for high throughput
  dropOldestOnQueueFull: false,
  
  // QoS defaults
  defaultSubscribeQos: 1,
  defaultPublishQos: 1,
}

/**
 * Map of preset names to configurations
 * @type {Object}
 */
export const PRESETS = {
  mobile: MOBILE_PRESET,
  desktop: DESKTOP_PRESET,
  agent: AGENT_PRESET,
  server: SERVER_PRESET,
}

/**
 * Get preset configuration by name
 * 
 * @param {string} presetName - Preset name ('mobile', 'desktop', 'agent', 'server')
 * @returns {Object|null} Preset configuration or null if not found
 */
export function getPreset(presetName) {
  return PRESETS[presetName] || null
}

/**
 * Merge preset with custom options
 * Custom options take precedence over preset values
 * 
 * @param {string} presetName - Preset name
 * @param {Object} customOptions - Custom configuration options
 * @returns {Object} Merged configuration
 */
export function mergeWithPreset(presetName, customOptions = {}) {
  const preset = getPreset(presetName)
  if (!preset) {
    return customOptions
  }
  return { ...preset, ...customOptions }
}

export default PRESETS
