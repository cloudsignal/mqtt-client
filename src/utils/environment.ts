/**
 * CloudSignal WebSocket Client - Environment Detection
 * 
 * Utilities for detecting the runtime environment (browser, Node.js)
 * and platform (Android, iOS, desktop).
 * 
 * @module utils/environment
 */

/**
 * Platform identifiers
 * @readonly
 * @enum {string}
 */
export const PLATFORMS = {
  ANDROID: 'android',
  IOS: 'ios',
  DESKTOP: 'desktop',
  NODE: 'node',
  UNKNOWN: 'unknown',
}

/**
 * Transport protocols
 * @readonly
 * @enum {string}
 */
export const TRANSPORTS = {
  WSS: 'wss',
  WS: 'ws',
  MQTTS: 'mqtts',
  MQTT: 'mqtt',
}

/**
 * Check if running in a browser environment
 * 
 * @returns {boolean} True if running in browser
 */
export function isBrowser() {
  return typeof window !== 'undefined' && 
         typeof window.document !== 'undefined'
}

/**
 * Check if running in Node.js environment
 * 
 * @returns {boolean} True if running in Node.js
 */
export function isNode() {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null
}

/**
 * Check if running in a Web Worker
 * 
 * @returns {boolean} True if running in Web Worker
 */
export function isWebWorker() {
  return typeof self === 'object' && 
         self.constructor && 
         self.constructor.name === 'DedicatedWorkerGlobalScope'
}

/**
 * Check if running in React Native
 * 
 * @returns {boolean} True if running in React Native
 */
export function isReactNative() {
  return typeof navigator !== 'undefined' && 
         navigator.product === 'ReactNative'
}

/**
 * Check if running on Android device (browser or React Native)
 * 
 * @returns {boolean} True if Android
 */
export function isAndroid() {
  if (isNode()) return false
  
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent)
  }
  
  return false
}

/**
 * Check if running on iOS device (browser or React Native)
 * 
 * @returns {boolean} True if iOS
 */
export function isIOS() {
  if (isNode()) return false
  
  if (typeof navigator !== 'undefined') {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
  }
  
  return false
}

/**
 * Check if running on a mobile device
 * 
 * @returns {boolean} True if mobile (Android or iOS)
 */
export function isMobile() {
  return isAndroid() || isIOS()
}

/**
 * Detect the current platform
 * 
 * @returns {string} Platform identifier (android, ios, desktop, node, unknown)
 */
export function getPlatform() {
  if (isNode()) {
    return PLATFORMS.NODE
  }
  
  if (isAndroid()) {
    return PLATFORMS.ANDROID
  }
  
  if (isIOS()) {
    return PLATFORMS.IOS
  }
  
  if (isBrowser()) {
    return PLATFORMS.DESKTOP
  }
  
  return PLATFORMS.UNKNOWN
}

/**
 * Get appropriate transport protocol for the current environment
 * 
 * @param {boolean} secure - Whether to use secure transport (default: true)
 * @returns {string} Transport protocol (wss, ws, mqtts, mqtt)
 */
export function getDefaultTransport(secure = true) {
  if (isBrowser() || isWebWorker() || isReactNative()) {
    // Browser environments use WebSocket
    return secure ? TRANSPORTS.WSS : TRANSPORTS.WS
  }
  
  if (isNode()) {
    // Node.js can use native MQTT
    return secure ? TRANSPORTS.MQTTS : TRANSPORTS.MQTT
  }
  
  // Default to secure WebSocket
  return TRANSPORTS.WSS
}

/**
 * Check if the environment supports WebSocket
 * 
 * @returns {boolean} True if WebSocket is available
 */
export function supportsWebSocket() {
  if (isBrowser()) {
    return 'WebSocket' in window
  }
  
  if (isNode()) {
    try {
      require('ws')
      return true
    } catch {
      return false
    }
  }
  
  return false
}

/**
 * Check if the environment supports native MQTT (TCP/TLS)
 * 
 * @returns {boolean} True if native MQTT is available
 */
export function supportsNativeMqtt() {
  if (isNode()) {
    try {
      require('net')
      return true
    } catch {
      return false
    }
  }
  
  // Browser environments don't support native MQTT
  return false
}

/**
 * Get the recommended preset name based on detected environment
 * 
 * @returns {string} Preset name (mobile, desktop, server)
 */
export function getRecommendedPreset() {
  const platform = getPlatform()
  
  switch (platform) {
    case PLATFORMS.ANDROID:
    case PLATFORMS.IOS:
      return 'mobile'
    
    case PLATFORMS.NODE:
      return 'server'
    
    case PLATFORMS.DESKTOP:
    default:
      return 'desktop'
  }
}

/**
 * Get environment information object
 * 
 * @returns {Object} Environment details
 */
export function getEnvironmentInfo() {
  return {
    platform: getPlatform(),
    isBrowser: isBrowser(),
    isNode: isNode(),
    isWebWorker: isWebWorker(),
    isReactNative: isReactNative(),
    isMobile: isMobile(),
    isAndroid: isAndroid(),
    isIOS: isIOS(),
    supportsWebSocket: supportsWebSocket(),
    supportsNativeMqtt: supportsNativeMqtt(),
    recommendedPreset: getRecommendedPreset(),
    defaultTransport: getDefaultTransport(true),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    nodeVersion: isNode() ? process.version : null,
  }
}

export default {
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
}
