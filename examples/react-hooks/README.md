# CloudSignal React Hooks

Framework-agnostic React hooks for CloudSignal MQTT. Works with any React setup (Create React App, Vite, Remix, etc.).

## Installation

```bash
npm install @cloudsignal/mqtt-client
```

## Files

- `useCloudSignal.ts` - Core hook for any authentication method
- `useCloudSignalContext.tsx` - React Context provider (optional)

## Quick Start

### Option 1: Direct Hook Usage

```tsx
import { useCloudSignal } from "./useCloudSignal";

function MyComponent() {
  const { 
    isConnected, 
    connect, 
    subscribe, 
    publish, 
    messages 
  } = useCloudSignal({ debug: true });

  useEffect(() => {
    // Connect with your credentials
    connect({
      host: "wss://connect.cloudsignal.app:18885/",
      username: "user@org_xxx",
      password: "your-token",
    });
  }, []);

  useEffect(() => {
    if (isConnected) {
      subscribe("my/topic");
    }
  }, [isConnected]);

  return (
    <div>
      <p>Status: {isConnected ? "Connected" : "Disconnected"}</p>
      <button onClick={() => publish("my/topic", { hello: "world" })}>
        Send Message
      </button>
      <ul>
        {messages.map((msg, i) => (
          <li key={i}>{JSON.stringify(msg.payload)}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Option 2: With Context Provider

```tsx
// App.tsx
import { CloudSignalProvider } from "./useCloudSignalContext";

function App() {
  return (
    <CloudSignalProvider debug={process.env.NODE_ENV === "development"}>
      <MyComponent />
    </CloudSignalProvider>
  );
}

// MyComponent.tsx
import { useCloudSignalContext } from "./useCloudSignalContext";

function MyComponent() {
  const { isConnected, publish } = useCloudSignalContext();
  // ...
}
```

## Authentication Methods

### Native CloudSignal Auth (Secret Key)

```tsx
const { connectWithToken } = useCloudSignal({
  tokenServiceUrl: "https://auth.cloudsignal.app",
});

await connectWithToken({
  host: "wss://connect.cloudsignal.app:18885/",
  organizationId: "your-org-uuid",
  secretKey: "cs_live_xxxxx",
  userEmail: "user@example.com",
});
```

### External IdP (Supabase, Firebase, etc.)

```tsx
const { connectWithToken } = useCloudSignal({
  tokenServiceUrl: "https://auth.cloudsignal.app",
});

await connectWithToken({
  host: "wss://connect.cloudsignal.app:18885/",
  organizationId: "your-org-uuid",
  externalToken: yourIdpAccessToken,
});
```

### Direct Credentials

```tsx
const { connect } = useCloudSignal();

await connect({
  host: "wss://connect.cloudsignal.app:18885/",
  username: "user@org_xxx",
  password: "mqtt-password",
});
```

## API Reference

### useCloudSignal Options

```typescript
interface UseCloudSignalOptions {
  debug?: boolean;              // Enable console logging
  tokenServiceUrl?: string;     // For token-based auth
  preset?: "mobile" | "desktop" | "agent" | "server";
  autoReconnect?: boolean;      // Default: true
}
```

### Return Value

```typescript
interface UseCloudSignalReturn {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  messages: Message[];

  // Connection
  connect(config: ConnectionConfig): Promise<void>;
  connectWithToken(config: TokenConfig): Promise<void>;
  disconnect(): void;

  // Messaging
  subscribe(topic: string, qos?: 0 | 1 | 2): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  publish(topic: string, message: unknown, options?: PublishOptions): void;

  // Utilities
  clearMessages(): void;
}
```

## React StrictMode

The hook includes guards to prevent double-connections in React 18 StrictMode. No additional configuration needed.

## TypeScript

Copy the hook file to your project. Type definitions are included inline.
