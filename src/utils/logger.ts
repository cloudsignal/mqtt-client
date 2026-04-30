/**
 * CloudSignal WebSocket Client - Logger Utility
 * 
 * Conditional logging with support for custom logger instances.
 * Provides consistent log formatting and level control.
 * 
 * @module utils/logger
 */

/**
 * Log levels
 * @readonly
 * @enum {number}
 */
export const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5,
}

/**
 * Default console logger
 * @type {Object}
 */
const consoleLogger = {
  error: (...args) => console.error('[CloudSignal]', ...args),
  warn: (...args) => console.warn('[CloudSignal]', ...args),
  info: (...args) => console.info('[CloudSignal]', ...args),
  log: (...args) => console.log('[CloudSignal]', ...args),
  debug: (...args) => console.debug('[CloudSignal]', ...args),
  trace: (...args) => console.trace('[CloudSignal]', ...args),
}

/**
 * Silent logger (no output)
 * @type {Object}
 */
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  log: () => {},
  debug: () => {},
  trace: () => {},
}

/**
 * Logger class with conditional output
 */
export class Logger {
  /**
   * Create a Logger instance
   * 
   * @param {Object} options - Logger options
   * @param {boolean} options.enabled - Enable logging
   * @param {number} options.level - Log level (default: INFO)
   * @param {Object} options.logger - Custom logger instance
   * @param {string} options.prefix - Log message prefix
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.level = options.level ?? LOG_LEVELS.INFO
    this.prefix = options.prefix || ''
    
    // Use custom logger or default console logger
    if (options.logger) {
      this._logger = this._wrapLogger(options.logger)
    } else {
      this._logger = this.enabled ? consoleLogger : silentLogger
    }
  }

  /**
   * Wrap a custom logger to ensure consistent interface
   * @private
   */
  _wrapLogger(customLogger) {
    return {
      error: customLogger.error?.bind(customLogger) || consoleLogger.error,
      warn: customLogger.warn?.bind(customLogger) || consoleLogger.warn,
      info: customLogger.info?.bind(customLogger) || consoleLogger.info,
      log: customLogger.log?.bind(customLogger) || consoleLogger.log,
      debug: customLogger.debug?.bind(customLogger) || consoleLogger.debug,
      trace: customLogger.trace?.bind(customLogger) || consoleLogger.trace,
    }
  }

  /**
   * Format log message with prefix and timestamp
   * @private
   */
  _format(message) {
    const timestamp = new Date().toISOString()
    return this.prefix 
      ? `[${timestamp}] ${this.prefix} ${message}`
      : `[${timestamp}] ${message}`
  }

  /**
   * Check if logging is enabled for a level
   * @private
   */
  _shouldLog(level) {
    return this.enabled && this.level >= level
  }

  /**
   * Log error message (always logged if enabled)
   * @param {...any} args - Log arguments
   */
  error(...args) {
    if (this._shouldLog(LOG_LEVELS.ERROR)) {
      this._logger.error(...args)
    }
  }

  /**
   * Log warning message
   * @param {...any} args - Log arguments
   */
  warn(...args) {
    if (this._shouldLog(LOG_LEVELS.WARN)) {
      this._logger.warn(...args)
    }
  }

  /**
   * Log info message
   * @param {...any} args - Log arguments
   */
  info(...args) {
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      this._logger.info(...args)
    }
  }

  /**
   * Log standard message (alias for info)
   * @param {...any} args - Log arguments
   */
  log(...args) {
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      this._logger.log(...args)
    }
  }

  /**
   * Log debug message
   * @param {...any} args - Log arguments
   */
  debug(...args) {
    if (this._shouldLog(LOG_LEVELS.DEBUG)) {
      this._logger.debug(...args)
    }
  }

  /**
   * Log trace message (most verbose)
   * @param {...any} args - Log arguments
   */
  trace(...args) {
    if (this._shouldLog(LOG_LEVELS.TRACE)) {
      this._logger.trace(...args)
    }
  }

  /**
   * Set log level
   * @param {number} level - New log level
   */
  setLevel(level) {
    this.level = level
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.enabled = enabled
  }

  /**
   * Create a child logger with a specific prefix
   * @param {string} childPrefix - Additional prefix for child logger
   * @returns {Logger} New logger instance
   */
  child(childPrefix) {
    const newPrefix = this.prefix 
      ? `${this.prefix}:${childPrefix}`
      : childPrefix
    
    return new Logger({
      enabled: this.enabled,
      level: this.level,
      logger: this._logger,
      prefix: newPrefix,
    })
  }
}

/**
 * Create a logger instance
 * 
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
export function createLogger(options = {}) {
  return new Logger(options)
}

/**
 * Create a debug logger (enabled based on debug flag)
 * 
 * @param {boolean} debug - Enable debug logging
 * @param {Object} customLogger - Custom logger instance
 * @returns {Logger} Logger instance
 */
export function createDebugLogger(debug = false, customLogger = null) {
  return new Logger({
    enabled: debug,
    level: debug ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN,
    logger: customLogger,
  })
}

export default {
  LOG_LEVELS,
  Logger,
  createLogger,
  createDebugLogger,
}
