/**
 * CloudSignal WebSocket Client - Token Manager
 * 
 * Handles V2 token lifecycle management including creation, exchange,
 * refresh, and automatic renewal scheduling.
 * 
 * @module TokenManager
 */

import { createDebugLogger } from './utils/logger'

/**
 * Token authentication errors
 * @readonly
 * @enum {string}
 */
export const TOKEN_ERRORS = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  REFRESH_FAILED: 'REFRESH_FAILED',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  ORG_NOT_FOUND: 'ORG_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
}

/**
 * Token states
 * @readonly
 * @enum {string}
 */
export const TOKEN_STATES = {
  NONE: 'none',
  VALID: 'valid',
  EXPIRING: 'expiring',
  EXPIRED: 'expired',
  REFRESHING: 'refreshing',
  ERROR: 'error',
}

/**
 * Token Manager class
 * Manages V2 token lifecycle with automatic refresh
 */
export class TokenManager {
  /**
   * Create a TokenManager instance
   * 
   * @param {Object} options - Manager options
   * @param {string} options.tokenServiceUrl - Token service base URL
   * @param {boolean} options.autoRefresh - Enable automatic refresh (default: true)
   * @param {number} options.refreshBufferSeconds - Seconds before expiry to refresh (default: 60)
   * @param {number} options.maxRefreshRetries - Max refresh retry attempts (default: 3)
   * @param {number} options.refreshRetryDelay - Delay between retries in ms (default: 5000)
   * @param {boolean} options.debug - Enable debug logging
   * @param {Object} options.logger - Custom logger instance
   */
  constructor(options = {}) {
    this.tokenServiceUrl = options.tokenServiceUrl
    this.autoRefresh = options.autoRefresh !== false
    this.refreshBufferSeconds = options.refreshBufferSeconds || 60
    this.maxRefreshRetries = options.maxRefreshRetries || 3
    this.refreshRetryDelay = options.refreshRetryDelay || 5000
    
    // Logger
    this.logger = createDebugLogger(options.debug, options.logger)
    
    // Token state
    this.tokenId = null
    this.accessToken = null
    this.mqttCredentials = null
    this.userEmail = null
    this.provider = null
    this.expiresAt = null
    this.refreshRecommendedAt = null
    this.organizationId = null
    this.state = TOKEN_STATES.NONE
    
    // Refresh management
    this.refreshTimer = null
    this.refreshRetryCount = 0
    this.isRefreshing = false
    
    // Callbacks
    this.onTokenExpiring = null
    this.onTokenRefreshed = null
    this.onTokenError = null
    this.onStateChange = null
  }

  /**
   * Set token expiring callback
   * Called when token is about to expire and refresh is needed
   * 
   * @param {Function} callback - Callback function(remainingSeconds)
   */
  setTokenExpiringCallback(callback) {
    this.onTokenExpiring = callback
  }

  /**
   * Set token refreshed callback
   * Called when token has been successfully refreshed
   * 
   * @param {Function} callback - Callback function(newCredentials)
   */
  setTokenRefreshedCallback(callback) {
    this.onTokenRefreshed = callback
  }

  /**
   * Set token error callback
   * Called when token operation fails
   * 
   * @param {Function} callback - Callback function(error, errorType)
   */
  setTokenErrorCallback(callback) {
    this.onTokenError = callback
  }

  /**
   * Set state change callback
   * Called when token state changes
   * 
   * @param {Function} callback - Callback function(newState, oldState)
   */
  setStateChangeCallback(callback) {
    this.onStateChange = callback
  }

  /**
   * Update token state and notify listeners
   * @private
   */
  _setState(newState) {
    const oldState = this.state
    if (oldState !== newState) {
      this.state = newState
      this.logger.debug(`Token state changed: ${oldState} -> ${newState}`)
      if (this.onStateChange) {
        this.onStateChange(newState, oldState)
      }
    }
  }

  /**
   * Make HTTP request to token service
   * @private
   */
  async _request(endpoint, method = 'GET', body = null) {
    if (!this.tokenServiceUrl) {
      throw new Error('Token service URL not configured')
    }

    const url = `${this.tokenServiceUrl}${endpoint}`
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    this.logger.debug(`Token API request: ${method} ${url}`)

    try {
      const response = await fetch(url, options)
      const data = await response.json()

      if (!response.ok) {
        const errorType = this._mapErrorType(response.status, data)
        const error = new Error(data.error_description || data.detail || 'Request failed')
        error.type = errorType
        error.status = response.status
        error.data = data
        throw error
      }

      return data
    } catch (error) {
      if (error.type) {
        throw error // Already processed
      }
      
      // Network error
      const networkError = new Error(`Network error: ${error.message}`)
      networkError.type = TOKEN_ERRORS.NETWORK_ERROR
      networkError.originalError = error
      throw networkError
    }
  }

  /**
   * Map HTTP status to error type
   * @private
   */
  _mapErrorType(status, data) {
    switch (status) {
      case 401:
        return data.error === 'token_expired' 
          ? TOKEN_ERRORS.TOKEN_EXPIRED 
          : TOKEN_ERRORS.AUTH_FAILED
      case 404:
        return data.error === 'provider_not_found'
          ? TOKEN_ERRORS.PROVIDER_NOT_FOUND
          : TOKEN_ERRORS.ORG_NOT_FOUND
      case 429:
        return TOKEN_ERRORS.RATE_LIMITED
      default:
        return TOKEN_ERRORS.INVALID_RESPONSE
    }
  }

  /**
   * Store token response data
   * @private
   */
  _storeToken(response) {
    this.tokenId = response.token_id
    this.accessToken = response.access_token
    this.mqttCredentials = response.mqtt_credentials
    this.userEmail = response.user_email
    this.provider = response.provider
    this.expiresAt = new Date(response.expires_at)
    this.refreshRecommendedAt = new Date(response.refresh_recommended_at)
    
    this._setState(TOKEN_STATES.VALID)
    
    // Schedule auto-refresh if enabled
    if (this.autoRefresh) {
      this._scheduleRefresh()
    }
  }

  /**
   * Create a native CloudSignal token
   * Uses secret key authentication (V2 API)
   * 
   * @param {Object} options - Token creation options
   * @param {string} options.organizationId - Organization UUID
   * @param {string} options.secretKey - Organization API secret key
   * @param {string} options.userEmail - User email address
   * @param {string} [options.integrationId] - Optional integration identifier
   * @param {boolean} [options.replaceExisting] - Replace existing token (default: true)
   * @returns {Promise<Object>} Token response with MQTT credentials
   */
  async createToken(options) {
    const { organizationId, secretKey, userEmail, integrationId, replaceExisting = true } = options

    if (!organizationId || !secretKey || !userEmail) {
      throw new Error('organizationId, secretKey, and userEmail are required')
    }

    this.organizationId = organizationId
    this.logger.info(`Creating native token for ${userEmail} in org ${organizationId}`)

    try {
      const response = await this._request('/v2/tokens/create', 'POST', {
        organization_id: organizationId,
        secret_key: secretKey,
        user_email: userEmail,
        integration_id: integrationId,
        replace_existing: replaceExisting,
      })

      this._storeToken(response)
      this.logger.info(`Token created successfully, expires at ${this.expiresAt.toISOString()}`)

      return this.getTokenInfo()
    } catch (error) {
      this._setState(TOKEN_STATES.ERROR)
      this.logger.error(`Token creation failed: ${error.message}`)
      
      if (this.onTokenError) {
        this.onTokenError(error, error.type || TOKEN_ERRORS.AUTH_FAILED)
      }
      
      throw error
    }
  }

  /**
   * Exchange an external IdP token for MQTT credentials
   * Supports Supabase, Firebase, Auth0, Clerk, and custom OIDC
   * 
   * @param {Object} options - Exchange options
   * @param {string} options.organizationId - Organization UUID
   * @param {string} options.token - External JWT token
   * @param {string} [options.integrationId] - Optional integration identifier
   * @returns {Promise<Object>} Token response with MQTT credentials
   */
  async exchangeToken(options) {
    const { organizationId, token, integrationId } = options

    if (!organizationId || !token) {
      throw new Error('organizationId and token are required')
    }

    this.organizationId = organizationId
    this.logger.info(`Exchanging external token for org ${organizationId}`)

    try {
      const response = await this._request('/v2/tokens/exchange', 'POST', {
        organization_id: organizationId,
        token: token,
        integration_id: integrationId,
      })

      this._storeToken(response)
      this.logger.info(`Token exchanged successfully via ${response.provider}, expires at ${this.expiresAt.toISOString()}`)

      return this.getTokenInfo()
    } catch (error) {
      this._setState(TOKEN_STATES.ERROR)
      this.logger.error(`Token exchange failed: ${error.message}`)
      
      if (this.onTokenError) {
        this.onTokenError(error, error.type || TOKEN_ERRORS.AUTH_FAILED)
      }
      
      throw error
    }
  }

  /**
   * Refresh the current token
   * Generates new credentials and extends expiry
   * 
   * @returns {Promise<Object>} Refreshed token info
   */
  async refreshToken() {
    if (!this.tokenId || !this.accessToken) {
      throw new Error('No token to refresh - create or exchange token first')
    }

    if (this.isRefreshing) {
      this.logger.debug('Refresh already in progress, skipping')
      return this.getTokenInfo()
    }

    this.isRefreshing = true
    this._setState(TOKEN_STATES.REFRESHING)
    this.logger.info('Refreshing token...')

    try {
      const response = await this._request('/v2/tokens/refresh', 'POST', {
        token_id: this.tokenId,
        current_token_password: this.accessToken,
      })

      this._storeToken(response)
      this.refreshRetryCount = 0
      this.logger.info(`Token refreshed successfully, new expiry: ${this.expiresAt.toISOString()}`)

      if (this.onTokenRefreshed) {
        this.onTokenRefreshed(this.getTokenInfo())
      }

      return this.getTokenInfo()
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`)
      
      // Retry logic
      if (this.refreshRetryCount < this.maxRefreshRetries) {
        this.refreshRetryCount++
        this.logger.info(`Scheduling refresh retry ${this.refreshRetryCount}/${this.maxRefreshRetries} in ${this.refreshRetryDelay}ms`)
        
        setTimeout(() => {
          this.isRefreshing = false
          this.refreshToken().catch(() => {})
        }, this.refreshRetryDelay)
        
        return this.getTokenInfo()
      }

      this._setState(TOKEN_STATES.ERROR)
      
      if (this.onTokenError) {
        this.onTokenError(error, TOKEN_ERRORS.REFRESH_FAILED)
      }
      
      throw error
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * Get list of enabled providers for an organization
   * 
   * @param {string} organizationId - Organization UUID
   * @returns {Promise<Array>} List of provider info objects
   */
  async getProviders(organizationId) {
    this.logger.debug(`Fetching providers for org ${organizationId}`)
    
    const response = await this._request(`/v2/providers?organization_id=${organizationId}`)
    return response.providers
  }

  /**
   * Schedule automatic token refresh
   * @private
   */
  _scheduleRefresh() {
    // Clear any existing timer
    this._cancelRefresh()

    if (!this.refreshRecommendedAt || !this.autoRefresh) {
      return
    }

    const now = Date.now()
    const refreshTime = this.refreshRecommendedAt.getTime()
    const delay = Math.max(0, refreshTime - now)

    if (delay <= 0) {
      // Token already needs refresh
      this.logger.warn('Token already past refresh time, refreshing immediately')
      this.refreshToken().catch(() => {})
      return
    }

    this.logger.debug(`Scheduling token refresh in ${Math.round(delay / 1000)}s`)

    this.refreshTimer = setTimeout(() => {
      this._setState(TOKEN_STATES.EXPIRING)
      
      // Notify about impending expiry
      if (this.onTokenExpiring) {
        const remainingSeconds = Math.round((this.expiresAt.getTime() - Date.now()) / 1000)
        this.onTokenExpiring(remainingSeconds)
      }
      
      // Perform refresh
      this.refreshToken().catch(() => {})
    }, delay)
  }

  /**
   * Cancel scheduled refresh
   * @private
   */
  _cancelRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /**
   * Get MQTT credentials for connection
   * 
   * @returns {Object|null} MQTT credentials {username, password} or null
   */
  getCredentials() {
    if (!this.mqttCredentials || this.isExpired()) {
      return null
    }
    return {
      username: this.mqttCredentials.username,
      password: this.mqttCredentials.password,
    }
  }

  /**
   * Get full token information
   * 
   * @returns {Object} Token info object
   */
  getTokenInfo() {
    return {
      tokenId: this.tokenId,
      accessToken: this.accessToken,
      mqttCredentials: this.mqttCredentials,
      userEmail: this.userEmail,
      provider: this.provider,
      organizationId: this.organizationId,
      expiresAt: this.expiresAt,
      refreshRecommendedAt: this.refreshRecommendedAt,
      state: this.state,
      isExpired: this.isExpired(),
      secondsUntilExpiry: this.getSecondsUntilExpiry(),
    }
  }

  /**
   * Check if token is expired
   * 
   * @returns {boolean} True if expired
   */
  isExpired() {
    if (!this.expiresAt) {
      return true
    }
    return Date.now() >= this.expiresAt.getTime()
  }

  /**
   * Get seconds until token expiry
   * 
   * @returns {number} Seconds until expiry (negative if expired)
   */
  getSecondsUntilExpiry() {
    if (!this.expiresAt) {
      return -1
    }
    return Math.round((this.expiresAt.getTime() - Date.now()) / 1000)
  }

  /**
   * Check if token needs refresh
   * 
   * @returns {boolean} True if should refresh now
   */
  needsRefresh() {
    if (!this.refreshRecommendedAt) {
      return this.isExpired()
    }
    return Date.now() >= this.refreshRecommendedAt.getTime()
  }

  /**
   * Check if token is valid and usable
   * 
   * @returns {boolean} True if token is valid
   */
  isValid() {
    return this.tokenId && 
           this.accessToken && 
           this.mqttCredentials &&
           !this.isExpired()
  }

  /**
   * Clear token data and cancel refresh
   */
  clear() {
    this._cancelRefresh()
    
    this.tokenId = null
    this.accessToken = null
    this.mqttCredentials = null
    this.userEmail = null
    this.provider = null
    this.expiresAt = null
    this.refreshRecommendedAt = null
    this.organizationId = null
    this.refreshRetryCount = 0
    this.isRefreshing = false
    
    this._setState(TOKEN_STATES.NONE)
  }

  /**
   * Destroy the token manager
   * Clears all data and callbacks
   */
  destroy() {
    this.clear()
    this.onTokenExpiring = null
    this.onTokenRefreshed = null
    this.onTokenError = null
    this.onStateChange = null
  }
}

/**
 * Create a TokenManager instance
 * 
 * @param {Object} options - Manager options
 * @returns {TokenManager} Token manager instance
 */
export function createTokenManager(options = {}) {
  return new TokenManager(options)
}

export default TokenManager
