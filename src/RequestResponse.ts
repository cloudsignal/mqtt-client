/**
 * CloudSignal WebSocket Client - Request/Response Handler
 * 
 * Implements request/response pattern for AI agent communication
 * using MQTT 5 properties (correlationData, responseTopic, userProperties).
 * 
 * @module RequestResponse
 */

import { 
  generateCorrelationId, 
  toBinaryCorrelationData, 
  fromBinaryCorrelationData,
  createCorrelationIdGenerator
} from './utils/correlation'
import { createDebugLogger } from './utils/logger'

/**
 * Request states
 * @readonly
 * @enum {string}
 */
export const REQUEST_STATES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  CANCELLED: 'cancelled',
}

/**
 * Request/Response handler class
 * Manages request tracking and response correlation for AI agents
 */
export class RequestResponseHandler {
  /**
   * Create a RequestResponseHandler instance
   * 
   * @param {Object} options - Handler options
   * @param {number} options.requestTimeout - Default request timeout in ms (default: 30000)
   * @param {string} options.responseTopicPattern - Response topic pattern ({clientId} replaced)
   * @param {string} options.correlationIdPrefix - Prefix for correlation IDs
   * @param {boolean} options.includeTimestamps - Include timestamps in messages
   * @param {boolean} options.includeSenderId - Include sender ID in messages
   * @param {number} options.messageExpiryInterval - Default message expiry in seconds
   * @param {boolean} options.debug - Enable debug logging
   * @param {Object} options.logger - Custom logger instance
   */
  constructor(options = {}) {
    this.requestTimeout = options.requestTimeout || 30000
    this.responseTopicPattern = options.responseTopicPattern || 'response/{clientId}'
    this.correlationIdPrefix = options.correlationIdPrefix || 'req'
    this.includeTimestamps = options.includeTimestamps !== false
    this.includeSenderId = options.includeSenderId !== false
    this.messageExpiryInterval = options.messageExpiryInterval || 0
    
    // Logger
    this.logger = createDebugLogger(options.debug, options.logger)
    
    // Pending requests map: correlationId -> { resolve, reject, timer, state, createdAt }
    this.pendingRequests = new Map()
    
    // Client reference (set during initialization)
    this.client = null
    this.clientId = null
    this.responseTopic = null
    
    // Correlation ID generator
    this.correlationIdGenerator = createCorrelationIdGenerator({
      prefix: this.correlationIdPrefix,
      format: 'sequential',
      includeTimestamp: false,
    })
    
    // Statistics
    this.stats = {
      requestsSent: 0,
      responsesReceived: 0,
      timeouts: 0,
      errors: 0,
    }
    
    // Callbacks
    this.onRequestSent = null
    this.onResponseReceived = null
    this.onRequestTimeout = null
    this.onRequestError = null
  }

  /**
   * Initialize the handler with a client
   * Subscribes to the response topic
   * 
   * @param {Object} client - MQTT client instance
   * @param {string} clientId - Client ID for response topic
   */
  async initialize(client, clientId) {
    this.client = client
    this.clientId = clientId
    this.responseTopic = this.responseTopicPattern.replace('{clientId}', clientId)
    
    this.logger.info(`Initializing request/response handler, response topic: ${this.responseTopic}`)
    
    // Subscribe to response topic if client is connected
    if (this.client && this.client.connected) {
      await this._subscribeToResponseTopic()
    }
  }

  /**
   * Subscribe to the response topic
   * @private
   */
  async _subscribeToResponseTopic() {
    return new Promise((resolve, reject) => {
      this.client.subscribe(this.responseTopic, { qos: 1 }, (err, granted) => {
        if (err) {
          this.logger.error(`Failed to subscribe to response topic: ${err.message}`)
          reject(err)
        } else {
          this.logger.debug(`Subscribed to response topic: ${this.responseTopic}`)
          resolve(granted)
        }
      })
    })
  }

  /**
   * Handle incoming message
   * Check if it's a response to a pending request
   * 
   * @param {string} topic - Message topic
   * @param {Buffer|string} message - Message payload
   * @param {Object} packet - Full MQTT packet with properties
   * @returns {boolean} True if message was handled as a response
   */
  handleMessage(topic, message, packet = {}) {
    // Check if this is a response to one of our requests
    const properties = packet.properties || {}
    let correlationId = null
    
    // Extract correlation ID from MQTT 5 properties
    if (properties.correlationData) {
      correlationId = fromBinaryCorrelationData(properties.correlationData)
    }
    
    // Fallback: check for correlationId in user properties
    if (!correlationId && properties.userProperties?.correlationId) {
      correlationId = properties.userProperties.correlationId
    }
    
    // Fallback: try to parse from message if JSON
    if (!correlationId && topic === this.responseTopic) {
      try {
        const parsed = JSON.parse(message.toString())
        correlationId = parsed.correlationId || parsed.correlation_id
      } catch {
        // Not JSON, ignore
      }
    }
    
    if (!correlationId) {
      return false
    }
    
    const pending = this.pendingRequests.get(correlationId)
    if (!pending) {
      this.logger.debug(`Received response for unknown correlation ID: ${correlationId}`)
      return false
    }
    
    // Clear timeout
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    
    // Parse message
    let payload
    try {
      payload = JSON.parse(message.toString())
    } catch {
      payload = message.toString()
    }
    
    // Build response object
    const response = {
      correlationId,
      topic,
      payload,
      properties,
      userProperties: properties.userProperties || {},
      receivedAt: Date.now(),
      latencyMs: Date.now() - pending.createdAt,
    }
    
    // Update state and resolve
    pending.state = REQUEST_STATES.COMPLETED
    this.pendingRequests.delete(correlationId)
    this.stats.responsesReceived++
    
    this.logger.debug(`Response received for ${correlationId}, latency: ${response.latencyMs}ms`)
    
    if (this.onResponseReceived) {
      this.onResponseReceived(response)
    }
    
    pending.resolve(response)
    return true
  }

  /**
   * Send a request and wait for response
   * 
   * @param {string} topic - Target topic
   * @param {Object|string} payload - Request payload
   * @param {Object} options - Request options
   * @param {number} options.timeout - Request timeout in ms
   * @param {number} options.qos - QoS level (default: 1)
   * @param {Object} options.userProperties - Additional user properties
   * @param {string} options.messageType - Message type identifier
   * @returns {Promise<Object>} Response object
   */
  async request(topic, payload, options = {}) {
    if (!this.client || !this.client.connected) {
      throw new Error('Client not connected')
    }
    
    const timeout = options.timeout || this.requestTimeout
    const qos = options.qos !== undefined ? options.qos : 1
    const correlationId = this.correlationIdGenerator.generate()
    
    // Build message
    const messagePayload = typeof payload === 'object' 
      ? JSON.stringify(this._enrichPayload(payload, correlationId, options))
      : payload
    
    // Build MQTT 5 properties
    const properties = {
      correlationData: toBinaryCorrelationData(correlationId),
      responseTopic: this.responseTopic,
      payloadFormatIndicator: 1, // UTF-8
      userProperties: {
        correlationId, // Fallback for MQTT 3.1.1
        ...this._buildUserProperties(correlationId, options),
        ...(options.userProperties || {}),
      },
    }
    
    // Add message expiry if configured
    if (this.messageExpiryInterval > 0 || options.messageExpiryInterval) {
      properties.messageExpiryInterval = options.messageExpiryInterval || this.messageExpiryInterval
    }
    
    // Create pending request record
    const createdAt = Date.now()
    
    const requestPromise = new Promise((resolve, reject) => {
      const pending = {
        resolve,
        reject,
        state: REQUEST_STATES.PENDING,
        createdAt,
        topic,
        correlationId,
        timer: null,
      }
      
      // Set timeout
      pending.timer = setTimeout(() => {
        if (this.pendingRequests.has(correlationId)) {
          pending.state = REQUEST_STATES.TIMEOUT
          this.pendingRequests.delete(correlationId)
          this.stats.timeouts++
          
          const error = new Error(`Request timeout after ${timeout}ms`)
          error.correlationId = correlationId
          error.topic = topic
          
          this.logger.warn(`Request ${correlationId} timed out after ${timeout}ms`)
          
          if (this.onRequestTimeout) {
            this.onRequestTimeout(correlationId, topic)
          }
          
          reject(error)
        }
      }, timeout)
      
      this.pendingRequests.set(correlationId, pending)
    })
    
    // Publish request
    try {
      await this._publish(topic, messagePayload, { qos, properties })
      this.stats.requestsSent++
      
      this.logger.debug(`Request ${correlationId} sent to ${topic}`)
      
      if (this.onRequestSent) {
        this.onRequestSent({ correlationId, topic, payload, properties })
      }
    } catch (error) {
      // Clean up on publish failure
      const pending = this.pendingRequests.get(correlationId)
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer)
        pending.state = REQUEST_STATES.ERROR
        this.pendingRequests.delete(correlationId)
      }
      this.stats.errors++
      
      if (this.onRequestError) {
        this.onRequestError(error, correlationId)
      }
      
      throw error
    }
    
    return requestPromise
  }

  /**
   * Send a message with metadata (fire-and-forget)
   * 
   * @param {string} topic - Target topic
   * @param {Object|string} payload - Message payload
   * @param {Object} options - Options
   * @param {number} options.qos - QoS level
   * @param {boolean} options.retain - Retain flag
   * @param {Object} options.userProperties - User properties
   * @param {string} options.messageType - Message type
   * @returns {Promise<void>}
   */
  async transmitWithMetadata(topic, payload, options = {}) {
    if (!this.client || !this.client.connected) {
      throw new Error('Client not connected')
    }
    
    const qos = options.qos !== undefined ? options.qos : 0
    const retain = options.retain || false
    
    // Build message
    const messagePayload = typeof payload === 'object'
      ? JSON.stringify(this._enrichPayload(payload, null, options))
      : payload
    
    // Build MQTT 5 properties
    const properties = {
      payloadFormatIndicator: 1,
      userProperties: {
        ...this._buildUserProperties(null, options),
        ...(options.userProperties || {}),
      },
    }
    
    if (this.messageExpiryInterval > 0 || options.messageExpiryInterval) {
      properties.messageExpiryInterval = options.messageExpiryInterval || this.messageExpiryInterval
    }
    
    await this._publish(topic, messagePayload, { qos, retain, properties })
    
    this.logger.debug(`Message sent to ${topic} with metadata`)
  }

  /**
   * Enrich payload with metadata
   * @private
   */
  _enrichPayload(payload, correlationId, options) {
    const enriched = { ...payload }
    
    if (this.includeTimestamps) {
      enriched._timestamp = Date.now()
      enriched._isoTimestamp = new Date().toISOString()
    }
    
    if (this.includeSenderId && this.clientId) {
      enriched._senderId = this.clientId
    }
    
    if (correlationId) {
      enriched._correlationId = correlationId
    }
    
    if (options.messageType) {
      enriched._messageType = options.messageType
    }
    
    return enriched
  }

  /**
   * Build user properties for MQTT 5
   * @private
   */
  _buildUserProperties(correlationId, options) {
    const props = {}
    
    if (this.includeTimestamps) {
      props.timestamp = Date.now().toString()
    }
    
    if (this.includeSenderId && this.clientId) {
      props.senderId = this.clientId
    }
    
    if (options.messageType) {
      props.messageType = options.messageType
    }
    
    return props
  }

  /**
   * Publish message via client
   * @private
   */
  _publish(topic, message, options) {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, options, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Cancel a pending request
   * 
   * @param {string} correlationId - Correlation ID to cancel
   * @returns {boolean} True if request was cancelled
   */
  cancelRequest(correlationId) {
    const pending = this.pendingRequests.get(correlationId)
    if (!pending) {
      return false
    }
    
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    
    pending.state = REQUEST_STATES.CANCELLED
    this.pendingRequests.delete(correlationId)
    
    const error = new Error('Request cancelled')
    error.correlationId = correlationId
    pending.reject(error)
    
    this.logger.debug(`Request ${correlationId} cancelled`)
    return true
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    for (const [correlationId, pending] of this.pendingRequests) {
      if (pending.timer) {
        clearTimeout(pending.timer)
      }
      pending.state = REQUEST_STATES.CANCELLED
      
      const error = new Error('Request cancelled')
      error.correlationId = correlationId
      pending.reject(error)
    }
    
    const count = this.pendingRequests.size
    this.pendingRequests.clear()
    
    this.logger.debug(`Cancelled ${count} pending requests`)
    return count
  }

  /**
   * Get number of pending requests
   * 
   * @returns {number} Count of pending requests
   */
  getPendingCount() {
    return this.pendingRequests.size
  }

  /**
   * Get statistics
   * 
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      requestsSent: 0,
      responsesReceived: 0,
      timeouts: 0,
      errors: 0,
    }
  }

  /**
   * Set callback for request sent
   * @param {Function} callback - Callback function(requestInfo)
   */
  setRequestSentCallback(callback) {
    this.onRequestSent = callback
  }

  /**
   * Set callback for response received
   * @param {Function} callback - Callback function(response)
   */
  setResponseReceivedCallback(callback) {
    this.onResponseReceived = callback
  }

  /**
   * Set callback for request timeout
   * @param {Function} callback - Callback function(correlationId, topic)
   */
  setRequestTimeoutCallback(callback) {
    this.onRequestTimeout = callback
  }

  /**
   * Set callback for request error
   * @param {Function} callback - Callback function(error, correlationId)
   */
  setRequestErrorCallback(callback) {
    this.onRequestError = callback
  }

  /**
   * Destroy the handler
   * Cancels all pending requests and clears state
   */
  destroy() {
    this.cancelAllRequests()
    this.client = null
    this.clientId = null
    this.responseTopic = null
    this.onRequestSent = null
    this.onResponseReceived = null
    this.onRequestTimeout = null
    this.onRequestError = null
  }
}

/**
 * Create a RequestResponseHandler instance
 * 
 * @param {Object} options - Handler options
 * @returns {RequestResponseHandler} Handler instance
 */
export function createRequestResponseHandler(options = {}) {
  return new RequestResponseHandler(options)
}

export default RequestResponseHandler
