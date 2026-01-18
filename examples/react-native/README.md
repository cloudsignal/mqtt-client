# CloudSignal React Native Example

Mobile app integration using CloudSignal MQTT with the `mobile` preset optimized for battery and intermittent connectivity.

## Features

- 📱 Mobile-optimized preset (battery-friendly keepalive, offline queue)
- 🔄 Automatic reconnection with exponential backoff
- 📴 Offline message queueing
- 🔐 Token-based authentication
- 🧭 App state handling (foreground/background)

## Setup

### 1. Install Dependencies

```bash
npm install @cloudsignal/mqtt-client
# or
yarn add @cloudsignal/mqtt-client
```

### 2. Add to Your Project

Copy these files to your React Native project:

```
src/
├── hooks/
│   └── useCloudSignal.ts
└── contexts/
    └── CloudSignalContext.tsx
```

### 3. Environment Setup

For Expo:
```bash
# app.json or app.config.js
{
  "expo": {
    "extra": {
      "cloudsignalOrgId": "your-org-uuid"
    }
  }
}
```

For bare React Native, use `react-native-config`:
```bash
npm install react-native-config
```

```env
# .env
CLOUDSIGNAL_ORG_ID=your-org-uuid
```

## Quick Start

### Option 1: Hook Usage

```tsx
import { useCloudSignal } from "./hooks/useCloudSignal";

function ChatScreen() {
  const { 
    isConnected, 
    connectWithToken, 
    subscribe, 
    publish, 
    messages 
  } = useCloudSignal({ debug: __DEV__ });

  useEffect(() => {
    // Get token from your auth provider
    const connect = async () => {
      const token = await getAuthToken(); // Supabase, Firebase, etc.
      
      await connectWithToken({
        host: "wss://connect.cloudsignal.app:18885/",
        organizationId: "your-org-uuid",
        externalToken: token,
      });
    };
    
    connect();
  }, []);

  useEffect(() => {
    if (isConnected) {
      subscribe("chat/room/123");
    }
  }, [isConnected]);

  return (
    <View>
      <Text>Status: {isConnected ? "Connected" : "Disconnected"}</Text>
      <FlatList
        data={messages}
        renderItem={({ item }) => <MessageBubble message={item} />}
      />
    </View>
  );
}
```

### Option 2: Context Provider

```tsx
// App.tsx
import { CloudSignalProvider } from "./contexts/CloudSignalContext";

export default function App() {
  return (
    <CloudSignalProvider debug={__DEV__}>
      <Navigation />
    </CloudSignalProvider>
  );
}

// Any component
import { useCloudSignalContext } from "./contexts/CloudSignalContext";

function NotificationBadge() {
  const { messages } = useCloudSignalContext();
  const unread = messages.filter(m => !m.read).length;
  
  return <Badge count={unread} />;
}
```

## Mobile-Specific Features

### App State Handling

The hook automatically handles app foreground/background transitions:

```tsx
// Built into useCloudSignal.ts
useEffect(() => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      // App came to foreground - check connection
      if (!isConnected && lastCredentials) {
        reconnect();
      }
    } else if (state === "background") {
      // App went to background - connection maintained
      // Mobile preset has longer keepalive to conserve battery
    }
  });

  return () => subscription.remove();
}, [isConnected]);
```

### Offline Queue

Messages published while offline are queued and sent when connection resumes:

```tsx
// This works even when offline
publish("events/user-action", { action: "button_press" });

// Check queue status
const { offlineQueueSize } = useCloudSignal();
console.log(`${offlineQueueSize} messages queued`);
```

### Network State Integration

```tsx
import NetInfo from "@react-native-community/netinfo";

// The hook can integrate with NetInfo for smarter reconnection
useEffect(() => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && !isConnected) {
      reconnect();
    }
  });
  
  return unsubscribe;
}, [isConnected]);
```

## Mobile Preset Settings

The `mobile` preset applies these optimizations:

| Setting | Value | Purpose |
|---------|-------|---------|
| `keepalive` | 60s | Longer interval to save battery |
| `reconnectPeriod` | 10s | Slower reconnect to conserve resources |
| `maxReconnectDelay` | 120s | Cap on backoff delay |
| `offlineQueueEnabled` | true | Queue messages when offline |
| `offlineQueueMaxSize` | 500 | Limit queue for memory |
| `postConnectDelay` | 500ms | Stability delay (helps Android) |
| `protocolVersion` | 4 | MQTT 3.1.1 for compatibility |

## Android-Specific Notes

### WebSocket Issues

Some Android devices have WebSocket issues. The mobile preset includes workarounds:

1. **Post-connect delay**: Prevents race conditions on connection
2. **MQTT 3.1.1**: More compatible than MQTT 5 on older Android
3. **Staggered subscriptions**: Prevents overwhelming the broker

### Background Execution

For true background message delivery on Android, consider:

```tsx
// Using react-native-background-fetch
import BackgroundFetch from "react-native-background-fetch";

BackgroundFetch.configure({
  minimumFetchInterval: 15, // minutes
}, async (taskId) => {
  // Reconnect and check for messages
  await reconnect();
  BackgroundFetch.finish(taskId);
});
```

## iOS-Specific Notes

### Background Modes

Enable background modes in Xcode for push-triggered reconnection:

1. Open Xcode project
2. Select target → Signing & Capabilities
3. Add "Background Modes"
4. Enable "Background fetch" and "Remote notifications"

### Push Notification Trigger

Use push notifications to wake the app and reconnect:

```tsx
// When receiving push notification
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // Reconnect MQTT to get full message
  await reconnect();
});
```

## Authentication with Common Providers

### Supabase

```tsx
import { supabase } from "./lib/supabase";

const { data: { session } } = await supabase.auth.getSession();

await connectWithToken({
  host: "wss://connect.cloudsignal.app:18885/",
  organizationId: ORG_ID,
  externalToken: session.access_token,
});

// Listen for token refresh
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED") {
    reconnect(session.access_token);
  }
});
```

### Firebase Auth

```tsx
import auth from "@react-native-firebase/auth";

const idToken = await auth().currentUser.getIdToken();

await connectWithToken({
  host: "wss://connect.cloudsignal.app:18885/",
  organizationId: ORG_ID,
  externalToken: idToken,
});
```

## Troubleshooting

See [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md) for common issues.

### Mobile-Specific Issues

**Connection drops in background:**
This is expected on mobile. The SDK will reconnect when app returns to foreground.

**High battery usage:**
Reduce `keepalive` interval or disable MQTT when not needed.

**Messages not received in background:**
Use push notifications for critical messages. MQTT connections may be suspended by the OS.
