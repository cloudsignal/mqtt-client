# Android Compatibility Issues & Solutions

## Known mqtt.js Issues on Android

Based on GitHub issues and community reports, here are known Android-specific problems:

### 1. MQTT v5 Protocol Issues

**Issue**: Android WebSocket implementations have compatibility issues with MQTT v5 protocol, causing immediate disconnects after connection/subscription.

**Solution**: This library automatically falls back to MQTT v3.1.1 (protocolVersion: 4) on Android devices.

**Reference**: Multiple GitHub issues report WebSocket disconnects on Android with MQTT v5.

### 2. Keepalive Timeout

**Issue**: Android browsers aggressively close idle WebSocket connections. Default 45-second keepalive may be too short.

**Solution**: This library uses 60-second keepalive on Android (vs 45s on iOS/Desktop).

### 3. Subscription Timing

**Issue**: Subscribing immediately after connection can cause disconnects on Android before the connection is fully stable.

**Solution**: This library adds a 500ms delay before processing subscriptions on Android.

### 4. Reconnection Frequency

**Issue**: Rapid reconnection attempts (5 seconds) can conflict with Android's network state handling.

**Solution**: This library uses 10-second reconnect period on Android (vs 5s on iOS/Desktop).

### 5. mqtt.js Issue #1727

**Issue**: After reconnection, client may become unable to continue publishing messages.

**Status**: Fixed in mqtt.js v5.14.1+ (we use ^5.14.1)

**Reference**: https://github.com/mqttjs/MQTT.js/issues/1727

## Current mqtt.js Version

**Latest Stable**: v5.14.1 (as of Nov 2024)

**Our Version**: ^5.14.1 (will get latest 5.x updates)

## Android-Specific Configuration

This library automatically detects Android and applies:

```javascript
{
  keepalive: 60,              // 60 seconds (vs 45s default)
  protocolVersion: 4,         // MQTT v3.1.1 (vs v5 default)
  reconnectPeriod: 10000,      // 10 seconds (vs 5s default)
  subscriptionDelay: 500      // 500ms delay before subscriptions
}
```

## Manual Override

If you need to override Android defaults:

```javascript
const client = new CloudSignalClient();

await client.connect({
  host: 'wss://connect.cloudsignal.app:18885/',
  username: 'user@org',
  password: 'token',
  clientId: 'client123',
  keepalive: 90,              // Override Android default
  protocolVersion: 5,         // Force MQTT v5 (not recommended for Android)
  reconnectPeriod: 15000      // Override reconnect period
});
```

## Testing on Android

To test Android compatibility:

1. **Enable verbose logging**:
   ```javascript
   const client = new CloudSignalClient(true); // verbose mode
   ```

2. **Check logs** for:
   - "Android detected - using optimized settings"
   - Connection stability
   - Subscription success

3. **Monitor**:
   - Connection duration
   - Reconnection frequency
   - Message delivery success

## Related GitHub Issues

- [mqtt.js #1727](https://github.com/mqttjs/MQTT.js/issues/1727) - Reconnection publish issues
- [MQTT v5 Android compatibility](https://github.com/mqttjs/MQTT.js/issues) - Various reports
- [WebSocket Android disconnects](https://github.com/mqttjs/MQTT.js/issues) - Keepalive/timeout issues

## Recommendations

1. **Always use versioned files** on Android: `CloudSignalWS.v1.0.0.js`
2. **Monitor connection health** using the provided callbacks
3. **Test thoroughly** on actual Android devices (not just emulators)
4. **Use MQTT v3.1.1** for Android (automatic in this library)
5. **Increase keepalive** if still experiencing disconnects (configurable)

