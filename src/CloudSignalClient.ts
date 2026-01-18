/**
 * CloudSignal WebSocket Client - Main Client Class
 * 
 * Enterprise-grade MQTT client for CloudSignal platform with V2 token management,
 * AI agent communication patterns, multi-transport support, and configurable settings.
 * 
 * @module CloudSignalClient
 * @version 2.2.1
 */

import mqtt from 'mqtt'
import type { MqttClient, IClientOptions, IClientPublishOptions } from 'mqtt'

import { DEFAULT_CONFIG } from './config/defaults'
import { PRESETS, getPreset, mergeWithPreset } from './config/presets'
import { 
  getPlatform, 
  getRecommendedPreset, 
  getDefaultTransport,
  isMobile,
  isAndroid,
  isIOS,
  isNode,
  isBrowser,
  PLATFORMS,
  TRANSPORTS,
  getEnvironmentInfo
} from './utils/environment'
import { createDebugLogger, LOG_LEVELS } from './utils/logger'
import { generateShortId } from './utils/correlation'
import { TokenManager, TOKEN_STATES, TOKEN_ERRORS, createTokenManager } from './TokenManager'
import { RequestResponseHandler, REQUEST_STATES, createRequestResponseHandler } from './RequestResponse'

/**
 * Client configuration options
 */
export interface ClientOptions {
  debug?: boolean
  logger?: any
  preset?: 'auto' | 'mobile' | 'desktop' | 'agent' | 'server'
  autoDetectPlatform?: boolean
  keepalive?: number
  connectTimeout?: number
  reconnectPeriod?: number
  maxReconnectAttempts?: number
  /** Maximum reconnect attempts specifically for auth errors (default: 0 = no retry on auth error) */
  maxAuthRetries?: number
  /** Whether to attempt reconnect on auth errors (default: false) */
  reconnectOnAuthError?: boolean
  protocolVersion?: 4 | 5
  cleanSession?: boolean
  tokenServiceUrl?: string
  autoRefresh?: boolean
  enableRequestResponse?: boolean
  requestTimeout?: number
  clientIdPrefix?: string
  offlineQueueEnabled?: boolean
  offlineQueueMaxSize?: number
  refreshBufferSeconds?: number
  maxRefreshRetries?: number
  refreshRetryDelay?: number
  responseTopicPattern?: string
  correlationIdPrefix?: string
  includeTimestamps?: boolean
  includeSenderId?: boolean
  messageExpiryInterval?: number
  [key: string]: any
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  host: string
  username?: string
  password?: string
  clientId?: string
  willTopic?: string
  willMessage?: string
  willQos?: 0 | 1 | 2
  willRetain?: boolean
  manualReconnect?: boolean
  manualReconnectPeriod?: number
}

/**
 * Token authentication configuration
 */
export interface TokenAuthConfig {
  host: string
  organizationId: string
  secretKey?: string
  userEmail?: string
  userName?: string
  metadata?: Record<string, any>
  provider?: 'supabase' | 'firebase' | 'auth0' | 'clerk' | 'oidc'
  /** External JWT token from IdP (Supabase, Firebase, Auth0, etc.) */
  externalToken?: string
  /** @deprecated Use externalToken instead */
  idToken?: string
  clientId?: string
  willTopic?: string
  willMessage?: string
  willQos?: 0 | 1 | 2
}

/**
 * Connection states
 * @readonly
 * @enum {string}
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTING: 'disconnecting',
  ERROR: 'error',
}

/**
 * CloudSignal WebSocket Client
 * 
 * Enterprise-grade MQTT client with V2 token management and AI agent features.
 */
export class CloudSignalClient {
  // Configuration
  config: ClientOptions & { _resolvedPreset?: string }
  logger: any
  
  // Platform info
  platform: string
  environmentInfo: any
  
  // MQTT client
  client: MqttClient | null
  connectionState: string
  
  // Subscriptions
  ongoingSubscriptions: Map<string, { qos: number; callback?: any }>
  
  // Message queues
  messageQueue: any[]
  offlineQueue: any[]
  
  // Connection tracking
  hasEverConnected: boolean
  reconnectAttempts: number
  lastConfig: ConnectionConfig | null
  clientId: string | null
  
  // Token management
  tokenManager: TokenManager | null
  
  // Request/Response handler
  requestHandler: RequestResponseHandler | null
  
  // Callbacks
  onConnectionStatusChange: ((isConnected: boolean, state?: string) => void) | null
  onOffline: (() => void) | null
  onOnline: (() => void) | null
  onReconnecting: ((attempt: number) => void) | null
  onAuthError: ((error: any) => void) | null
  _messageCallbacks: Array<(topic: string, message: any, packet?: any) => void>

  /**
   * Create a CloudSignalClient instance
   * 
   * @param {Object} options - Configuration options (see DEFAULT_CONFIG for all options)
   * @param {boolean} options.debug - Enable debug logging
   * @param {Object} options.logger - Custom logger instance
   * @param {string} options.preset - Platform preset ('auto', 'mobile', 'desktop', 'agent', 'server')
   * @param {boolean} options.autoDetectPlatform - Enable platform auto-detection
   * @param {number} options.keepalive - MQTT keepalive in seconds
   * @param {number} options.connectTimeout - Connection timeout in ms
   * @param {number} options.reconnectPeriod - Reconnect interval in ms
   * @param {number} options.maxReconnectAttempts - Max reconnect attempts
   * @param {number} options.protocolVersion - MQTT protocol version (4 or 5)
   * @param {boolean} options.cleanSession - Clean session flag
   * @param {string} options.tokenServiceUrl - Token service URL for V2 auth
   * @param {boolean} options.autoRefresh - Enable auto token refresh
   * @param {boolean} options.enableRequestResponse - Enable request/response pattern
   * @param {number} options.requestTimeout - Default request timeout
   */
  constructor(options = {}) {
    // Handle legacy boolean argument for backward compatibility
    if (typeof options === 'boolean') {
      options = { debug: options }
    }

    // Resolve preset configuration
    this.config = this._resolveConfig(options)
    
    // Initialize logger
    this.logger = createDebugLogger(this.config.debug, this.config.logger)
    this.logger.info(`CloudSignal Client v2.2.1 initializing...`)
    
    // Platform info
    this.platform = getPlatform()
    this.environmentInfo = getEnvironmentInfo()
    this.logger.debug(`Platform: ${this.platform}, Transport: ${this.environmentInfo.defaultTransport}`)
    
    // MQTT client
    this.client = null
    this.connectionState = CONNECTION_STATES.DISCONNECTED
    
    // Subscriptions
    this.ongoingSubscriptions = new Map() // topic -> { qos, callback }
    
    // Message queues
    this.messageQueue = []
    this.offlineQueue = []
    
    // Connection tracking
    this.hasEverConnected = false
    this.reconnectAttempts = 0
    this.lastConfig = null
    this.clientId = null
    
    // Token management
    this.tokenManager = null
    if (this.config.tokenServiceUrl) {
      this.tokenManager = createTokenManager({
        tokenServiceUrl: this.config.tokenServiceUrl,
        autoRefresh: this.config.autoRefresh,
        refreshBufferSeconds: this.config.refreshBufferSeconds,
        maxRefreshRetries: this.config.maxRefreshRetries,
        refreshRetryDelay: this.config.refreshRetryDelay,
        debug: this.config.debug,
        logger: this.config.logger,
      })
    }
    
    // Request/Response handler
    this.requestHandler = null
    if (this.config.enableRequestResponse) {
      this.requestHandler = createRequestResponseHandler({
        requestTimeout: this.config.requestTimeout,
        responseTopicPattern: this.config.responseTopicPattern,
        correlationIdPrefix: this.config.correlationIdPrefix,
        includeTimestamps: this.config.includeTimestamps,
        includeSenderId: this.config.includeSenderId,
        messageExpiryInterval: this.config.messageExpiryInterval,
        debug: this.config.debug,
        logger: this.config.logger,
      })
    }
    
    // Callbacks
    this.onConnectionStatusChange = null
    this.onOffline = null
    this.onOnline = null
    this.onReconnecting = null
    this.onAuthError = null
    this._messageCallbacks = []
  }

  /**
   * Resolve configuration from options, preset, and defaults
   * @private
   */
  _resolveConfig(options) {
    let config = { ...DEFAULT_CONFIG }
    
    // Determine preset
    let presetName = options.preset || 'auto'
    
    if (presetName === 'auto') {
      if (options.autoDetectPlatform !== false) {
        presetName = getRecommendedPreset()
      } else {
        presetName = 'desktop' // Default when auto-detect is disabled
      }
    }
    
    // Apply preset
    const preset = getPreset(presetName)
    if (preset) {
      config = { ...config, ...preset }
    }
    
    // Apply user options (highest priority)
    config = { ...config, ...options }
    
    // Store resolved preset name
    config._resolvedPreset = presetName
    
    return config
  }

  /**
   * Generate a client ID
   * @private
   */
  _generateClientId() {
    const prefix = this.config.clientIdPrefix || 'cs_'
    const random = generateShortId()
    return `${prefix}${random}`
  }

  /**
   * Set connection state and notify listeners
   * @private
   */
  _setConnectionState(newState) {
    const oldState = this.connectionState
    if (oldState !== newState) {
      this.connectionState = newState
      this.logger.debug(`Connection state: ${oldState} -> ${newState}`)
      
      if (this.onConnectionStatusChange) {
        const isConnected = newState === CONNECTION_STATES.CONNECTED
        this.onConnectionStatusChange(isConnected, newState)
      }
    }
  }

  // ===========================================================================
  // CONNECTION METHODS
  // ===========================================================================

  /**
   * Connect to CloudSignal MQTT broker
   * 
   * @param {Object} config - Connection configuration
   * @param {string} config.host - WebSocket/MQTT URL
   * @param {string} config.username - MQTT username
   * @param {string} config.password - MQTT password
   * @param {string} [config.clientId] - Client ID (auto-generated if not provided)
   * @param {string} [config.willTopic] - Last will topic
   * @param {string} [config.willMessage] - Last will message
   * @param {number} [config.willQos] - Last will QoS
   * @param {boolean} [config.willRetain] - Last will retain flag
   * @returns {Promise<void>} Resolves when connected
   */
  connect(config) {
    return new Promise((resolve, reject) => {
      // Already connected?
      if (this.client && this.client.connected) {
        this.logger.debug('Already connected')
        return resolve()
      }

      this._setConnectionState(CONNECTION_STATES.CONNECTING)
      this.reconnectAttempts = 0

      // Generate client ID if not provided
      this.clientId = config.clientId || this._generateClientId()
      this.logger.info(`Connecting to ${config.host} as ${this.clientId}`)

      // Build MQTT connection options
      const options = {
        clientId: this.clientId,
        keepalive: this.config.keepalive,
        protocolId: this.config.protocolId,
        protocolVersion: this.config.protocolVersion,
        clean: this.config.cleanSession,
        username: config.username,
        password: config.password,
        connectTimeout: this.config.connectTimeout,
        reconnectPeriod: this.config.maxReconnectAttempts === 0 ? this.config.reconnectPeriod : 
                          (this.config.reconnectPeriod || 0),
      }

      // Add Last Will if provided
      if (config.willTopic && config.willMessage) {
        options.will = {
          topic: config.willTopic,
          payload: config.willMessage,
          qos: config.willQos || 0,
          retain: config.willRetain || false,
        }
      }

      // TLS options for mqtts://
      if (this.config.tlsOptions) {
        Object.assign(options, this.config.tlsOptions)
      }
      if (this.config.rejectUnauthorized !== undefined) {
        options.rejectUnauthorized = this.config.rejectUnauthorized
      }

      // Connect
      this.client = mqtt.connect(config.host, options)
      this.lastConfig = config

      // Event handlers
      this.client.on('connect', () => {
        this.logger.info('Connected to CloudSignal')
        this.hasEverConnected = true
        this.reconnectAttempts = 0
        this._setConnectionState(CONNECTION_STATES.CONNECTED)
        
        // Apply post-connect delay for mobile stability
        const delay = this.config.postConnectDelay || 0
        if (delay > 0) {
          this.logger.debug(`Applying ${delay}ms post-connect delay`)
          setTimeout(() => {
            this._onConnect()
            resolve()
          }, delay)
        } else {
          this._onConnect()
          resolve()
        }
      })

      this.client.on('offline', () => {
        this.logger.debug('Client offline')
        if (this.hasEverConnected) {
          this._setConnectionState(CONNECTION_STATES.DISCONNECTED)
          this._triggerOfflineEvent()
        }
      })

      this.client.on('error', (error) => {
        this.logger.error(`Connection error: ${error.message}`)
        
        const isAuthError = error.message.includes('Not authorized') || 
                           error.message.includes('Bad User Name or Password') ||
                           error.message.includes('Connection refused: Bad username or password')
        
        if (isAuthError) {
          this._setConnectionState(CONNECTION_STATES.ERROR)
          
          // Stop reconnection attempts on auth errors unless explicitly enabled
          if (!this.config.reconnectOnAuthError) {
            this.logger.warn('Auth error detected, stopping reconnect attempts. Set reconnectOnAuthError: true to override.')
            if (this.client) {
              this.client.end(true) // Force disconnect to stop reconnect loop
            }
          }
          
          if (this.onAuthError) {
            this.onAuthError(error)
          }
          reject(new Error('Authentication failed: incorrect username or password'))
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          this._setConnectionState(CONNECTION_STATES.ERROR)
          reject(error)
        } else {
          reject(error)
        }
      })

      this.client.on('close', () => {
        this.logger.debug('Connection closed')
        if (this.hasEverConnected && this.connectionState !== CONNECTION_STATES.ERROR) {
          this._setConnectionState(CONNECTION_STATES.DISCONNECTED)
        }
      })

      this.client.on('reconnect', () => {
        this.reconnectAttempts++
        this.logger.debug(`Reconnect attempt #${this.reconnectAttempts}`)
        this._setConnectionState(CONNECTION_STATES.RECONNECTING)
        
        if (this.onReconnecting) {
          this.onReconnecting(this.reconnectAttempts)
        }
        
        // Check max attempts
        if (this.config.maxReconnectAttempts > 0 && 
            this.reconnectAttempts >= this.config.maxReconnectAttempts) {
          this.logger.warn(`Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`)
          this.client.end(true)
          this._setConnectionState(CONNECTION_STATES.ERROR)
        }
      })

      // Message handler
      this.client.on('message', (topic, message, packet) => {
        this._handleMessage(topic, message, packet)
      })
    })
  }

  /**
   * Connect using token authentication (V2)
   * Creates/exchanges token and then connects
   * 
   * @param {Object} config - Auth configuration
   * @param {string} config.host - Broker URL
   * @param {string} config.organizationId - Organization UUID
   * @param {string} [config.secretKey] - Secret key (for native auth)
   * @param {string} [config.userEmail] - User email (required for native auth)
   * @param {string} [config.externalToken] - External JWT (for IdP exchange)
   * @param {string} [config.integrationId] - Integration identifier
   * @param {string} [config.willTopic] - Last will topic
   * @param {string} [config.willMessage] - Last will message
   * @returns {Promise<Object>} Token info with connection status
   */
  async connectWithToken(config) {
    if (!this.tokenManager) {
      throw new Error('Token service URL not configured')
    }

    this.logger.info('Connecting with token authentication...')

    let tokenInfo
    
    // Support idToken as alias for externalToken (for backward compatibility)
    const externalToken = config.externalToken || config.idToken
    
    // Determine auth method
    if (externalToken) {
      // External IdP exchange
      tokenInfo = await this.tokenManager.exchangeToken({
        organizationId: config.organizationId,
        token: externalToken,
        integrationId: config.integrationId,
      })
    } else if (config.secretKey && config.userEmail) {
      // Native CloudSignal auth
      tokenInfo = await this.tokenManager.createToken({
        organizationId: config.organizationId,
        secretKey: config.secretKey,
        userEmail: config.userEmail,
        integrationId: config.integrationId,
      })
    } else {
      throw new Error('Either externalToken or (secretKey + userEmail) required')
    }

    // Connect using token credentials
    const credentials = this.tokenManager.getCredentials()
    await this.connect({
      host: config.host,
      username: credentials.username,
      password: credentials.password,
      clientId: config.clientId,
      willTopic: config.willTopic,
      willMessage: config.willMessage,
      willQos: config.willQos,
      willRetain: config.willRetain,
    })

    // Set up token refresh callback to update credentials
    this.tokenManager.setTokenRefreshedCallback((newTokenInfo) => {
      this.logger.info('Token refreshed, credentials updated')
      // Note: MQTT connection uses the same password until reconnect
      // For live credential update, would need to reconnect
    })

    return tokenInfo
  }

  /**
   * Handle successful connection
   * @private
   */
  _onConnect() {
    this._triggerOnlineEvent()
    this._processQueue()
    this._processOfflineQueue()
    this._resubscribeAll()
    
    // Initialize request handler if enabled
    if (this.requestHandler && this.client) {
      this.requestHandler.initialize(this.client, this.clientId).catch(err => {
        this.logger.error(`Failed to initialize request handler: ${err.message}`)
      })
    }
  }

  /**
   * Check if client is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.client && this.client.connected
  }

  /**
   * Get current connection state
   * @returns {string} Connection state
   */
  getConnectionState() {
    return this.connectionState
  }

  /**
   * Disconnect from broker
   * @param {boolean} force - Force immediate disconnect
   * @returns {Promise<void>}
   */
  disconnect(force = false) {
    return new Promise((resolve) => {
      this._setConnectionState(CONNECTION_STATES.DISCONNECTING)
      
      // Cancel request handler
      if (this.requestHandler) {
        this.requestHandler.destroy()
      }
      
      if (this.client) {
        this.client.end(force, {}, () => {
          this.client = null
          this._setConnectionState(CONNECTION_STATES.DISCONNECTED)
          resolve()
        })
      } else {
        this._setConnectionState(CONNECTION_STATES.DISCONNECTED)
        resolve()
      }
      
      this.ongoingSubscriptions.clear()
    })
  }

  /**
   * Force reconnection
   */
  forceReconnect() {
    if (this.lastConfig) {
      this.logger.info('Forcing reconnection...')
      this.reconnectAttempts = 0
      
      if (this.client) {
        this.client.end(true, () => {
          this.client = null
          this.connect(this.lastConfig).catch(err => {
            this.logger.error(`Force reconnect failed: ${err.message}`)
          })
        })
      } else {
        this.connect(this.lastConfig).catch(err => {
          this.logger.error(`Force reconnect failed: ${err.message}`)
        })
      }
    } else {
      this.logger.warn('Cannot force reconnect - no stored config')
    }
  }

  // ===========================================================================
  // SUBSCRIPTION METHODS
  // ===========================================================================

  /**
   * Subscribe to a topic
   * 
   * @param {string} topic - MQTT topic
   * @param {number|Object} [options] - QoS level or options object
   * @param {number} options.qos - Quality of Service (0, 1, or 2)
   * @param {Function} options.callback - Per-topic message callback
   * @returns {Promise<Object>} Subscription grant info
   */
  subscribe(topic, options = {}) {
    return new Promise((resolve, reject) => {
      // Handle legacy number argument
      if (typeof options === 'number') {
        options = { qos: options }
      }
      
      const qos = options.qos !== undefined ? options.qos : this.config.defaultSubscribeQos
      
      if (!this.client || !this.client.connected) {
        return reject(new Error('Client not connected'))
      }

      // Check if already subscribed
      if (this.ongoingSubscriptions.has(topic)) {
        this.logger.debug(`Already subscribed to: ${topic}`)
        return resolve({ topic, qos })
      }

      this.logger.debug(`Subscribing to: ${topic} (QoS ${qos})`)
      
      this.client.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          this.logger.error(`Subscription error for ${topic}: ${error.message}`)
          reject(error)
        } else {
          this.logger.debug(`Subscribed to: ${topic}`)
          this.ongoingSubscriptions.set(topic, { 
            qos, 
            callback: options.callback || null 
          })
          resolve(granted)
        }
      })
    })
  }

  /**
   * Unsubscribe from a topic
   * 
   * @param {string} topic - MQTT topic
   * @returns {Promise<void>}
   */
  unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Client not connected'))
      }

      this.client.unsubscribe(topic, (error) => {
        if (error) {
          this.logger.error(`Unsubscribe error for ${topic}: ${error.message}`)
          reject(error)
        } else {
          this.logger.debug(`Unsubscribed from: ${topic}`)
          this.ongoingSubscriptions.delete(topic)
          resolve()
        }
      })
    })
  }

  /**
   * Get list of current subscriptions
   * @returns {Array<string>} List of subscribed topics
   */
  getSubscriptions() {
    return Array.from(this.ongoingSubscriptions.keys())
  }

  /**
   * Check if subscribed to a topic
   * @param {string} topic - Topic to check
   * @returns {boolean}
   */
  isSubscribed(topic) {
    return this.ongoingSubscriptions.has(topic)
  }

  /**
   * Resubscribe to all topics after reconnect
   * @private
   */
  _resubscribeAll() {
    if (this.ongoingSubscriptions.size === 0) {
      return
    }

    this.logger.debug(`Resubscribing to ${this.ongoingSubscriptions.size} topics...`)
    
    const entries = Array.from(this.ongoingSubscriptions.entries())
    const delay = this.config.resubscribeDelay || 100
    const stagger = this.config.staggeredResubscribe !== false
    
    // Temporarily clear to allow resubscription
    const toRestore = [...entries]
    this.ongoingSubscriptions.clear()
    
    let currentDelay = 0
    for (const [topic, { qos, callback }] of toRestore) {
      if (stagger) {
        setTimeout(() => {
          if (this.client && this.client.connected) {
            this.subscribe(topic, { qos, callback }).catch(err => {
              this.logger.warn(`Failed to resubscribe to ${topic}: ${err.message}`)
            })
          }
        }, currentDelay)
        currentDelay += delay
      } else {
        this.subscribe(topic, { qos, callback }).catch(err => {
          this.logger.warn(`Failed to resubscribe to ${topic}: ${err.message}`)
        })
      }
    }
  }

  // ===========================================================================
  // PUBLISH METHODS
  // ===========================================================================

  /**
   * Publish/transmit a message
   * 
   * @param {string} topic - Target topic
   * @param {string|Object} message - Message payload
   * @param {Object} [options] - Publish options
   * @param {number} options.qos - Quality of Service (0, 1, or 2)
   * @param {boolean} options.retain - Retain message on broker
   * @param {Object} options.properties - MQTT 5 properties
   * @returns {Promise<void>}
   */
  transmit(topic, message, options = {}) {
    // Handle legacy QoS number argument
    if (typeof options === 'number') {
      options = { qos: options }
    }
    
    const qos = options.qos !== undefined ? options.qos : this.config.defaultPublishQos
    const retain = options.retain || false
    
    if (this.isConnected()) {
      return this._publishMessage(topic, message, { qos, retain, ...options })
    }
    
    // Queue for later
    if (this.config.enableOfflineQueue) {
      this.logger.debug('Client offline, queuing message')
      
      // Check queue size
      if (this.config.maxOfflineQueueSize > 0 && 
          this.offlineQueue.length >= this.config.maxOfflineQueueSize) {
        if (this.config.dropOldestOnQueueFull) {
          this.offlineQueue.shift()
        } else {
          this.logger.warn('Offline queue full, dropping message')
          return Promise.resolve()
        }
      }
      
      this.offlineQueue.push({ topic, message, options: { qos, retain, ...options } })
    }
    
    return Promise.resolve()
  }

  /**
   * Publish message with metadata (AI agent helper)
   * 
   * @param {string} topic - Target topic
   * @param {Object} payload - Message payload
   * @param {Object} [options] - Options including metadata
   * @returns {Promise<void>}
   */
  transmitWithMetadata(topic, payload, options = {}) {
    if (this.requestHandler) {
      return this.requestHandler.transmitWithMetadata(topic, payload, options)
    }
    
    // Fallback to regular transmit with manual metadata
    const enriched = {
      ...payload,
      _timestamp: Date.now(),
      _senderId: this.clientId,
    }
    return this.transmit(topic, JSON.stringify(enriched), options)
  }

  /**
   * Internal publish method
   * @private
   */
  _publishMessage(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      const payload = typeof message === 'object' ? JSON.stringify(message) : message
      
      this.client.publish(topic, payload, options, (error) => {
        if (error) {
          this.logger.error(`Publish error: ${error.message}`)
          reject(error)
        } else {
          this.logger.debug(`Published to: ${topic}`)
          resolve()
        }
      })
    })
  }

  // ===========================================================================
  // REQUEST/RESPONSE METHODS (AI AGENT)
  // ===========================================================================

  /**
   * Send a request and wait for response
   * Requires enableRequestResponse: true
   * 
   * @param {string} topic - Target topic
   * @param {Object} payload - Request payload
   * @param {Object} [options] - Request options
   * @param {number} options.timeout - Request timeout in ms
   * @param {number} options.qos - QoS level
   * @param {Object} options.userProperties - MQTT 5 user properties
   * @returns {Promise<Object>} Response object
   */
  async request(topic, payload, options = {}) {
    if (!this.requestHandler) {
      throw new Error('Request/response not enabled. Set enableRequestResponse: true')
    }
    
    return this.requestHandler.request(topic, payload, options)
  }

  /**
   * Get request/response statistics
   * @returns {Object|null} Stats or null if not enabled
   */
  getRequestStats() {
    return this.requestHandler ? this.requestHandler.getStats() : null
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(topic, message, packet) {
    // Check if request handler wants this message
    if (this.requestHandler && this.requestHandler.handleMessage(topic, message, packet)) {
      return // Handled as response
    }
    
    // Check for topic-specific callback
    const subscription = this.ongoingSubscriptions.get(topic)
    if (subscription && subscription.callback) {
      subscription.callback(topic, message.toString(), packet)
    }
    
    // Call global message callbacks
    const messageStr = message.toString()
    for (const callback of this._messageCallbacks) {
      callback(topic, messageStr, packet)
    }
  }

  /**
   * Set up global message handler
   * 
   * @param {Function} callback - Callback function(topic, message, packet)
   */
  onMessage(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function')
    }
    this._messageCallbacks.push(callback)
  }

  /**
   * Remove a message handler
   * 
   * @param {Function} callback - Callback to remove
   */
  offMessage(callback) {
    const index = this._messageCallbacks.indexOf(callback)
    if (index !== -1) {
      this._messageCallbacks.splice(index, 1)
    }
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================

  /**
   * Create a native CloudSignal token (V2)
   * Requires tokenServiceUrl configuration
   * 
   * @param {Object} options - Token options
   * @param {string} options.organizationId - Organization UUID
   * @param {string} options.secretKey - API secret key
   * @param {string} options.userEmail - User email
   * @param {string} [options.integrationId] - Integration ID
   * @returns {Promise<Object>} Token info
   */
  async createToken(options) {
    if (!this.tokenManager) {
      throw new Error('Token service URL not configured')
    }
    return this.tokenManager.createToken(options)
  }

  /**
   * Exchange external IdP token for MQTT credentials (V2)
   * Supports Supabase, Firebase, Auth0, Clerk, custom OIDC
   * 
   * @param {Object} options - Exchange options
   * @param {string} options.organizationId - Organization UUID
   * @param {string} options.token - External JWT
   * @param {string} [options.integrationId] - Integration ID
   * @returns {Promise<Object>} Token info
   */
  async exchangeToken(options) {
    if (!this.tokenManager) {
      throw new Error('Token service URL not configured')
    }
    return this.tokenManager.exchangeToken(options)
  }

  /**
   * Manually refresh the current token
   * @returns {Promise<Object>} Refreshed token info
   */
  async refreshToken() {
    if (!this.tokenManager) {
      throw new Error('Token service URL not configured')
    }
    return this.tokenManager.refreshToken()
  }

  /**
   * Get list of enabled auth providers for an organization
   * 
   * @param {string} organizationId - Organization UUID
   * @returns {Promise<Array>} Provider list
   */
  async getProviders(organizationId) {
    if (!this.tokenManager) {
      throw new Error('Token service URL not configured')
    }
    return this.tokenManager.getProviders(organizationId)
  }

  /**
   * Get current token information
   * @returns {Object|null} Token info or null
   */
  getTokenInfo() {
    return this.tokenManager ? this.tokenManager.getTokenInfo() : null
  }

  // ===========================================================================
  // QUEUE PROCESSING
  // ===========================================================================

  /**
   * Process message queue
   * @private
   */
  _processQueue() {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const { topic, message, options } = this.messageQueue.shift()
      this._publishMessage(topic, message, options).catch(() => {})
    }
  }

  /**
   * Process offline queue
   * @private
   */
  _processOfflineQueue() {
    while (this.offlineQueue.length > 0 && this.isConnected()) {
      const { topic, message, options } = this.offlineQueue.shift()
      this._publishMessage(topic, message, options).catch(() => {})
    }
  }

  // ===========================================================================
  // CALLBACK SETTERS
  // ===========================================================================

  /**
   * Set connection status callback
   * @param {Function} callback - Callback(isConnected, state)
   */
  setConnectionStatusCallback(callback) {
    this.onConnectionStatusChange = callback
  }

  /**
   * Set offline callback
   * @param {Function} callback - Callback()
   */
  setOfflineCallback(callback) {
    this.onOffline = callback
  }

  /**
   * Set online callback
   * @param {Function} callback - Callback()
   */
  setOnlineCallback(callback) {
    this.onOnline = callback
  }

  /**
   * Set reconnecting callback
   * @param {Function} callback - Callback(attemptNumber)
   */
  setReconnectingCallback(callback) {
    this.onReconnecting = callback
  }

  /**
   * Set auth error callback
   * @param {Function} callback - Callback(error)
   */
  setAuthErrorCallback(callback) {
    this.onAuthError = callback
  }

  /**
   * Set token expiring callback (for token management)
   * @param {Function} callback - Callback(remainingSeconds)
   */
  setTokenExpiringCallback(callback) {
    if (this.tokenManager) {
      this.tokenManager.setTokenExpiringCallback(callback)
    }
  }

  /**
   * Set token refreshed callback
   * @param {Function} callback - Callback(newTokenInfo)
   */
  setTokenRefreshedCallback(callback) {
    if (this.tokenManager) {
      this.tokenManager.setTokenRefreshedCallback(callback)
    }
  }

  /**
   * Set token error callback
   * @param {Function} callback - Callback(error, errorType)
   */
  setTokenErrorCallback(callback) {
    if (this.tokenManager) {
      this.tokenManager.setTokenErrorCallback(callback)
    }
  }

  // ===========================================================================
  // EVENT TRIGGERS
  // ===========================================================================

  /**
   * @private
   */
  _triggerOfflineEvent() {
    if (this.onOffline) {
      this.onOffline()
    }
  }

  /**
   * @private
   */
  _triggerOnlineEvent() {
    if (this.onOnline) {
      this.onOnline()
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get client configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config }
  }

  /**
   * Get environment information
   * @returns {Object} Environment details
   */
  getEnvironment() {
    return this.environmentInfo
  }

  /**
   * Get client ID
   * @returns {string|null} Client ID or null if not connected
   */
  getClientId() {
    return this.clientId
  }

  /**
   * Destroy the client
   * Disconnects and cleans up all resources
   */
  destroy() {
    // Disconnect
    if (this.client) {
      this.client.end(true)
      this.client = null
    }
    
    // Cleanup token manager
    if (this.tokenManager) {
      this.tokenManager.destroy()
      this.tokenManager = null
    }
    
    // Cleanup request handler
    if (this.requestHandler) {
      this.requestHandler.destroy()
      this.requestHandler = null
    }
    
    // Clear state
    this.ongoingSubscriptions.clear()
    this.messageQueue = []
    this.offlineQueue = []
    this._messageCallbacks = []
    
    // Clear callbacks
    this.onConnectionStatusChange = null
    this.onOffline = null
    this.onOnline = null
    this.onReconnecting = null
    this.onAuthError = null
    
    this._setConnectionState(CONNECTION_STATES.DISCONNECTED)
  }
}

// Export as default for ES modules
export default CloudSignalClient

// Re-export related classes and utilities
export { 
  TokenManager, 
  TOKEN_STATES, 
  TOKEN_ERRORS,
  createTokenManager 
} from './TokenManager'

export { 
  RequestResponseHandler, 
  REQUEST_STATES,
  createRequestResponseHandler 
} from './RequestResponse'

