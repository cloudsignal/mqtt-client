# CloudSignal Vanilla JavaScript Example

Simple HTML + JavaScript example using CloudSignal MQTT without any build tools or frameworks.

## Features

- 📦 No build step required - just open in browser
- 🌐 Uses CDN-hosted SDK
- 🎨 Interactive UI for testing
- 📝 Debug logging panel

## Usage

### Option 1: Open Directly

Just open `index.html` in your browser. The SDK is loaded from CDN.

### Option 2: Local Server

For the best experience (avoids some browser security restrictions):

```bash
# Python 3
python -m http.server 8080

# Node.js (with npx)
npx serve .

# PHP
php -S localhost:8080
```

Then open http://localhost:8080

## CDN Integration

The SDK is loaded via script tag:

```html
<!-- From unpkg -->
<script src="https://unpkg.com/@cloudsignal/mqtt-client@2.2.0/dist/index.global.js"></script>

<!-- Or from jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@cloudsignal/mqtt-client@2.2.0/dist/index.global.js"></script>
```

## Basic Code Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>CloudSignal Example</title>
</head>
<body>
  <div id="status">Disconnected</div>
  <button id="connect">Connect</button>
  
  <script src="https://unpkg.com/@cloudsignal/mqtt-client@2.2.0/dist/index.global.js"></script>
  <script>
    let client = null;
    
    document.getElementById('connect').onclick = async () => {
      // Create client (note: use CloudSignal.default for IIFE bundle)
      client = new CloudSignal.default({
        tokenServiceUrl: 'https://auth.cloudsignal.app',
        preset: 'desktop',
        debug: true,
      });
      
      // Set up handlers
      client.onConnectionStatusChange = (isConnected) => {
        document.getElementById('status').textContent = 
          isConnected ? 'Connected' : 'Disconnected';
      };
      
      client.onMessage((topic, message) => {
        console.log('Received:', topic, message);
      });
      
      // Connect
      try {
        await client.connectWithToken({
          host: 'wss://connect.cloudsignal.app:18885/',
          organizationId: 'your-org-uuid',
          secretKey: 'cs_live_xxxxx',
          userEmail: 'user@example.com',
        });
        
        // Subscribe
        await client.subscribe('my/topic');
        
        // Publish
        client.transmit('my/topic', { hello: 'world' });
        
      } catch (error) {
        console.error('Connection failed:', error);
      }
    };
  </script>
</body>
</html>
```

## Global Namespace

When loaded via script tag, the SDK exposes a `CloudSignal` global object:

```javascript
// The main client class
const client = new CloudSignal.default(options);

// Other exports are also available
CloudSignal.VERSION          // "2.2.0"
CloudSignal.CONNECTION_STATES // { CONNECTED: "connected", ... }
```

## Minimal Example

For the absolute minimum code:

```html
<script src="https://unpkg.com/@cloudsignal/mqtt-client@2.2.0/dist/index.global.js"></script>
<script>
(async () => {
  const client = new CloudSignal.default({
    tokenServiceUrl: 'https://auth.cloudsignal.app',
  });
  
  client.onMessage((topic, msg) => console.log(topic, msg));
  
  await client.connectWithToken({
    host: 'wss://connect.cloudsignal.app:18885/',
    organizationId: 'ORG_ID',
    secretKey: 'SECRET_KEY',
    userEmail: 'user@example.com',
  });
  
  await client.subscribe('test/#');
  client.transmit('test/hello', { ts: Date.now() });
})();
</script>
```

## Browser Compatibility

The SDK works in all modern browsers:

- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

For older browsers, you may need polyfills for:
- `fetch`
- `Promise`
- `TextEncoder`/`TextDecoder`
