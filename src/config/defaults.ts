/**
 * CloudSignal WebSocket Client - Default Configuration
 * 
 * All configurable options with their default values.
 * These can be overridden via constructor options or platform presets.
 * 
 * @module config/defaults
 */

/**
 * Default configuration values
 * @type {Object}
 */
export const DEFAULT_CONFIG = {
  // ==========================================================================
  // LOGGING
  // ==========================================================================
  
  /** Enable debug logging */
  debug: false,
  
  /** Custom logger instance (must have log, warn, error methods) */
  logger: null,

  // ==========================================================================
  // PLATFORM DETECTION
  // ==========================================================================
  
  /**
   * Platform preset to use
   * @type {'auto'|'mobile'|'desktop'|'agent'|'server'}
   */
  preset: 'auto',
  
  /** Enable automatic platform detection (Android, iOS, Desktop, Node.js) */
  autoDetectPlatform: true,

  // ==========================================================================
  // CONNECTION
  // ==========================================================================
  
  /** MQTT keepalive interval in seconds */
  keepalive: 60,
  
  /** Connection timeout in milliseconds */
  connectTimeout: 30000,
  
  /** Auto-reconnect period in milliseconds (0 to disable) */
  reconnectPeriod: 5000,
  
  /** Maximum reconnection attempts before giving up (0 for unlimited) */
  maxReconnectAttempts: 50,
  
  /**
   * MQTT protocol version
   * @type {4|5} - 4 for MQTT 3.1.1, 5 for MQTT 5.0
   */
  protocolVersion: 5,
  
  /** MQTT protocol ID */
  protocolId: 'MQTT',
  
  /** Clean session flag (false = persistent sessions) */
  cleanSession: false,
  
  /** Client ID prefix (full ID will be prefix + random suffix) */
  clientIdPrefix: 'cs_',

  // ==========================================================================
  // RECONNECTION
  // ==========================================================================
  
  /** Enable exponential backoff for reconnection */
  reconnectBackoff: true,
  
  /** Maximum reconnect delay in milliseconds (for backoff) */
  maxReconnectDelay: 60000,
  
  /** Backoff multiplier for each failed attempt */
  reconnectBackoffMultiplier: 1.5,

  // ==========================================================================
  // MOBILE-SPECIFIC
  // ==========================================================================
  
  /** Delay after connect before processing subscriptions (ms) - helps Android stability */
  postConnectDelay: 0,
  
  /** Delay between resubscriptions on reconnect (ms) */
  resubscribeDelay: 100,
  
  /** Stagger subscriptions to prevent overwhelming broker */
  staggeredResubscribe: true,

  // ==========================================================================
  // TOKEN MANAGEMENT (V2)
  // ==========================================================================
  
  /** Token service base URL (e.g., https://auth.cloudsignal.app) */
  tokenServiceUrl: null,
  
  /** Enable automatic token refresh before expiry */
  autoRefresh: true,
  
  /** Seconds before expiry to trigger refresh (buffer time) */
  refreshBufferSeconds: 60,
  
  /** Maximum token refresh retry attempts */
  maxRefreshRetries: 3,
  
  /** Retry delay for failed refresh attempts (ms) */
  refreshRetryDelay: 5000,

  // ==========================================================================
  // AI AGENT FEATURES
  // ==========================================================================
  
  /** Enable request/response pattern for AI agents */
  enableRequestResponse: false,
  
  /** Default timeout for request/response operations (ms) */
  requestTimeout: 30000,
  
  /** Response topic pattern ({clientId} will be replaced) */
  responseTopicPattern: 'response/{clientId}',
  
  /** Correlation ID prefix for request tracking */
  correlationIdPrefix: 'req_',
  
  /** Include timestamps in message metadata */
  includeTimestamps: true,
  
  /** Include sender ID in message metadata */
  includeSenderId: true,

  // ==========================================================================
  // MQTT 5 FEATURES
  // ==========================================================================
  
  /** Default message expiry interval in seconds (0 = no expiry) */
  messageExpiryInterval: 0,
  
  /** Default payload format indicator (0 = bytes, 1 = UTF-8) */
  payloadFormatIndicator: 1,

  // ==========================================================================
  // TRANSPORT
  // ==========================================================================
  
  /**
   * Preferred transport protocol
   * @type {'auto'|'wss'|'ws'|'mqtts'|'mqtt'}
   */
  transport: 'auto',
  
  /** TLS options for mqtts:// connections (Node.js only) */
  tlsOptions: null,
  
  /** Reject unauthorized TLS certificates (set false for self-signed) */
  rejectUnauthorized: true,

  // ==========================================================================
  // QUALITY OF SERVICE
  // ==========================================================================
  
  /** Default QoS for subscriptions */
  defaultSubscribeQos: 1,
  
  /** Default QoS for publish operations */
  defaultPublishQos: 0,

  // ==========================================================================
  // OFFLINE HANDLING
  // ==========================================================================
  
  /** Enable offline message queue */
  enableOfflineQueue: true,
  
  /** Maximum messages to queue while offline (0 = unlimited) */
  maxOfflineQueueSize: 1000,
  
  /** Drop oldest messages when queue is full (false = drop new) */
  dropOldestOnQueueFull: true,
}

/**
 * Connection-specific options that can be overridden per connect() call
 * @type {Object}
 */
export const CONNECTION_OPTIONS = {
  /** WebSocket/MQTT URL */
  host: null,
  
  /** MQTT username */
  username: null,
  
  /** MQTT password */
  password: null,
  
  /** Client ID (auto-generated if not provided) */
  clientId: null,
  
  /** Last Will topic */
  willTopic: null,
  
  /** Last Will message */
  willMessage: null,
  
  /** Last Will QoS */
  willQos: 0,
  
  /** Last Will retain flag */
  willRetain: false,
}

/**
 * Token authentication options
 * @type {Object}
 */
export const TOKEN_AUTH_OPTIONS = {
  /** Organization UUID */
  organizationId: null,
  
  /** API secret key (for native auth) */
  secretKey: null,
  
  /** User email address */
  userEmail: null,
  
  /** External JWT token (for IdP exchange) */
  externalToken: null,
  
  /** Integration identifier */
  integrationId: null,
  
  /** Replace existing token for same email */
  replaceExisting: true,
}

export default DEFAULT_CONFIG
