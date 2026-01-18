/**
 * CloudSignal WebSocket Client - Correlation Utilities
 * 
 * Generates correlation IDs for request/response pattern tracking.
 * Provides multiple ID formats for different use cases.
 * 
 * @module utils/correlation
 */

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, otherwise fallback implementation
 * 
 * @returns {string} UUID v4 string
 */
export function generateUUID() {
  // Use native crypto if available (browser and Node.js 14.17+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Use Web Crypto API if available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
  
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Generate a short ID (8 characters)
 * Suitable for display or logging
 * 
 * @returns {string} 8-character alphanumeric ID
 */
export function generateShortId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(8)
    crypto.getRandomValues(array)
    for (let i = 0; i < 8; i++) {
      result += chars[array[i] % chars.length]
    }
  } else {
    for (let i = 0; i < 8; i++) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  
  return result
}

/**
 * Generate a timestamp-based ID
 * Format: timestamp-random (e.g., 1704067200000-abc123)
 * 
 * @returns {string} Timestamp-based ID
 */
export function generateTimestampId() {
  const timestamp = Date.now()
  const random = generateShortId().substring(0, 6)
  return `${timestamp}-${random}`
}

/**
 * Correlation ID counter for sequential IDs
 * @private
 */
let correlationCounter = 0

/**
 * Generate a sequential correlation ID with prefix
 * Format: prefix_sequence_random (e.g., req_0001_abc123)
 * 
 * @param {string} prefix - ID prefix (default: 'req')
 * @returns {string} Sequential correlation ID
 */
export function generateSequentialId(prefix = 'req') {
  correlationCounter++
  const sequence = correlationCounter.toString().padStart(4, '0')
  const random = generateShortId().substring(0, 6)
  return `${prefix}_${sequence}_${random}`
}

/**
 * Reset the sequential counter (useful for testing)
 */
export function resetSequentialCounter() {
  correlationCounter = 0
}

/**
 * Correlation ID generator class
 * Maintains state and provides customizable ID generation
 */
export class CorrelationIdGenerator {
  /**
   * Create a correlation ID generator
   * 
   * @param {Object} options - Generator options
   * @param {string} options.prefix - ID prefix (default: 'req')
   * @param {string} options.format - ID format ('uuid', 'short', 'timestamp', 'sequential')
   * @param {boolean} options.includeTimestamp - Include timestamp in IDs
   */
  constructor(options = {}) {
    this.prefix = options.prefix || 'req'
    this.format = options.format || 'sequential'
    this.includeTimestamp = options.includeTimestamp || false
    this.counter = 0
  }

  /**
   * Generate a new correlation ID
   * 
   * @returns {string} Correlation ID
   */
  generate() {
    let id
    
    switch (this.format) {
      case 'uuid':
        id = generateUUID()
        break
      
      case 'short':
        id = generateShortId()
        break
      
      case 'timestamp':
        id = generateTimestampId()
        break
      
      case 'sequential':
      default:
        this.counter++
        const sequence = this.counter.toString().padStart(4, '0')
        const random = generateShortId().substring(0, 6)
        id = `${sequence}_${random}`
    }
    
    // Add prefix
    if (this.prefix) {
      id = `${this.prefix}_${id}`
    }
    
    // Add timestamp if requested
    if (this.includeTimestamp && this.format !== 'timestamp') {
      id = `${Date.now()}_${id}`
    }
    
    return id
  }

  /**
   * Reset the sequential counter
   */
  reset() {
    this.counter = 0
  }

  /**
   * Parse a correlation ID to extract components
   * 
   * @param {string} correlationId - Correlation ID to parse
   * @returns {Object} Parsed components
   */
  parse(correlationId) {
    const parts = correlationId.split('_')
    
    return {
      raw: correlationId,
      prefix: this.prefix && correlationId.startsWith(this.prefix) ? this.prefix : null,
      parts: parts,
      timestamp: this.extractTimestamp(correlationId),
    }
  }

  /**
   * Extract timestamp from a correlation ID if present
   * @private
   */
  extractTimestamp(correlationId) {
    // Look for a 13-digit number (Unix timestamp in ms)
    const match = correlationId.match(/\b(\d{13})\b/)
    return match ? parseInt(match[1], 10) : null
  }
}

/**
 * Create a new correlation ID generator
 * 
 * @param {Object} options - Generator options
 * @returns {CorrelationIdGenerator} Generator instance
 */
export function createCorrelationIdGenerator(options = {}) {
  return new CorrelationIdGenerator(options)
}

/**
 * Default correlation ID generation function
 * Uses sequential format with 'req' prefix
 * 
 * @param {string} prefix - Optional prefix override
 * @returns {string} Correlation ID
 */
export function generateCorrelationId(prefix = 'req') {
  return generateSequentialId(prefix)
}

/**
 * Convert string to binary correlation data (for MQTT 5)
 * 
 * @param {string} correlationId - Correlation ID string
 * @returns {Buffer|Uint8Array} Binary correlation data
 */
export function toBinaryCorrelationData(correlationId) {
  if (typeof Buffer !== 'undefined') {
    // Node.js
    return Buffer.from(correlationId, 'utf8')
  }
  
  // Browser
  const encoder = new TextEncoder()
  return encoder.encode(correlationId)
}

/**
 * Convert binary correlation data to string
 * 
 * @param {Buffer|Uint8Array} data - Binary correlation data
 * @returns {string} Correlation ID string
 */
export function fromBinaryCorrelationData(data) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    // Node.js
    return data.toString('utf8')
  }
  
  // Browser
  const decoder = new TextDecoder()
  return decoder.decode(data)
}

export default {
  generateUUID,
  generateShortId,
  generateTimestampId,
  generateSequentialId,
  resetSequentialCounter,
  generateCorrelationId,
  CorrelationIdGenerator,
  createCorrelationIdGenerator,
  toBinaryCorrelationData,
  fromBinaryCorrelationData,
}
