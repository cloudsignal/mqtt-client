# CloudSignal + Next.js + Supabase Example

This example demonstrates how to integrate CloudSignal MQTT with a Next.js application using Supabase for authentication.

## Features

- ✅ Supabase JWT token exchange
- ✅ Automatic token refresh handling
- ✅ React StrictMode compatible (no double-connect issues)
- ✅ Connection state management via React Context
- ✅ TypeScript support

## Prerequisites

1. A CloudSignal organization with Supabase integration enabled
2. A Supabase project with authentication configured
3. Node.js 18+ and npm/pnpm/yarn

## Setup

### 1. Install Dependencies

```bash
npm install @cloudsignal/mqtt-client @supabase/supabase-js
```

### 2. Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_CLOUDSIGNAL_ORG_ID=your-org-uuid
```

### 3. Copy the Files

Copy the following files to your Next.js project:

- `hooks/use-mqtt.ts` → `src/hooks/use-mqtt.ts`
- `contexts/mqtt-context.tsx` → `src/contexts/mqtt-context.tsx`
- `lib/supabase.ts` → `src/lib/supabase.ts`

### 4. Wrap Your App

In `app/layout.tsx` or `pages/_app.tsx`:

```tsx
import { MQTTProvider } from "@/contexts/mqtt-context";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <MQTTProvider>
          {children}
        </MQTTProvider>
      </body>
    </html>
  );
}
```

### 5. Use in Components

```tsx
"use client";

import { useMQTT } from "@/contexts/mqtt-context";

export function ChatComponent() {
  const { isConnected, subscribe, publish, messages } = useMQTT();

  useEffect(() => {
    if (isConnected) {
      subscribe("chat/room/123");
    }
  }, [isConnected]);

  const sendMessage = (text: string) => {
    publish("chat/room/123", { text, timestamp: Date.now() });
  };

  return (
    <div>
      <p>Status: {isConnected ? "Connected" : "Disconnected"}</p>
      {/* ... */}
    </div>
  );
}
```

## How It Works

### Token Exchange Flow

1. User signs in via Supabase Auth
2. Supabase provides a JWT access token
3. CloudSignal SDK exchanges this JWT for MQTT credentials via `/v2/tokens/exchange`
4. SDK connects to MQTT broker with the exchanged credentials
5. When the Supabase token refreshes, the SDK handles reconnection automatically

### React StrictMode Handling

React 18's StrictMode double-mounts components in development. This example handles it by:

1. Using refs to track connection state (`connectingRef`, `mountedRef`)
2. Checking if component is still mounted before storing the client
3. Properly cleaning up on unmount

See `hooks/use-mqtt.ts` for the implementation details.

## Troubleshooting

See the main [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md) for common issues.

### Quick Fixes

**"Bad User Name or Password" on reconnect:**
This typically means your Supabase token expired. The SDK (v2.2.0+) now stops reconnect attempts on auth errors. Listen for token refresh events from Supabase and create a new connection.

**Multiple connection attempts in development:**
This is React StrictMode behavior. The guards in `use-mqtt.ts` prevent actual duplicate connections.

## File Structure

```
nextjs-supabase/
├── README.md                 # This file
├── hooks/
│   └── use-mqtt.ts          # Core MQTT hook with connection guards
├── contexts/
│   └── mqtt-context.tsx     # React Context for app-wide MQTT state
└── lib/
    └── supabase.ts          # Supabase client configuration
```
