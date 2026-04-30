# CloudSignal + Next.js + Clerk Example

This example demonstrates how to integrate CloudSignal MQTT with a Next.js application using Clerk for authentication.

## Features

- ✅ Clerk JWT token exchange with CloudSignal
- ✅ Automatic token refresh handling (destroys stale client, reconnects with fresh token)
- ✅ React StrictMode compatible (no double-connect issues)
- ✅ Detailed connection states (`connected`, `auth_error`, `no_token`, etc.)
- ✅ Tab visibility handling (auto-reconnect when tab becomes visible)
- ✅ Typed message handlers for notifications, transactions, and jobs
- ✅ TypeScript support

## Prerequisites

1. A CloudSignal organization with Clerk as an external auth provider
2. A Clerk application with JWT templates configured
3. Node.js 18+ and npm/pnpm/yarn

## Setup

### 1. Install Dependencies

```bash
npm install @cloudsignal/mqtt-client @clerk/nextjs
```

### 2. Environment Variables

Create `.env.local`:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# CloudSignal
NEXT_PUBLIC_CLOUDSIGNAL_ORG_ID=your-org-uuid
NEXT_PUBLIC_CLOUDSIGNAL_HOST=wss://connect.cloudsignal.app:18885/
```

### 3. Configure Clerk JWT Template

In Clerk Dashboard → **JWT Templates**, create a template that includes the `email` claim (required by CloudSignal):

```json
{
  "email": "{{user.primary_email_address}}",
  "user_id": "{{user.id}}",
  "name": "{{user.first_name}} {{user.last_name}}"
}
```

**Important**: The `email` claim is required for CloudSignal to identify the user.

### 4. Configure CloudSignal Auth Provider

In CloudSignal Dashboard → **Organization Settings** → **Auth Providers**:

1. Select **Clerk** as the provider type
2. Enter your Clerk JWKS URL: `https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json`
3. Save the configuration

### 5. Copy the Files

Copy the following files to your Next.js project:

- `hooks/use-mqtt.ts` → `src/hooks/use-mqtt.ts`
- `contexts/mqtt-context.tsx` → `src/contexts/mqtt-context.tsx`

### 6. Set Up Providers

In `app/providers.tsx`:

```tsx
"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { MQTTProvider } from "@/contexts/mqtt-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <MQTTProvider
        debug={process.env.NODE_ENV === "development"}
        topicPrefix="myapp"
      >
        {children}
      </MQTTProvider>
    </ClerkProvider>
  );
}
```

In `app/layout.tsx`:

```tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Usage

### Basic Connection Status

```tsx
"use client";

import { useMQTT } from "@/contexts/mqtt-context";

export function ConnectionStatus() {
  const { isConnected, connectionState, reconnect } = useMQTT();

  return (
    <div>
      <p>Status: {connectionState}</p>
      {!isConnected && (
        <button onClick={reconnect}>Reconnect</button>
      )}
    </div>
  );
}
```

### Subscribing to Notifications

```tsx
"use client";

import { useEffect } from "react";
import { useMQTT } from "@/contexts/mqtt-context";

export function NotificationListener() {
  const { onNotification } = useMQTT();

  useEffect(() => {
    const unsubscribe = onNotification((message) => {
      console.log("Notification:", message.title, message.message);
      // Show toast, update badge, etc.
    });

    return unsubscribe;
  }, [onNotification]);

  return null;
}
```

### Subscribing to Transactions

```tsx
"use client";

import { useEffect, useState } from "react";
import { useMQTT } from "@/contexts/mqtt-context";

export function BalanceDisplay() {
  const { onTransaction } = useMQTT();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const unsubscribe = onTransaction((message) => {
      setBalance(message.new_balance);
      // Show toast for transaction
    });

    return unsubscribe;
  }, [onTransaction]);

  return <div>Balance: {balance} coins</div>;
}
```

### Tracking Job Progress

```tsx
"use client";

import { useEffect, useState } from "react";
import { useMQTT } from "@/contexts/mqtt-context";

export function JobProgress({ jobId }: { jobId: string }) {
  const { subscribeToJob } = useMQTT();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("pending");

  useEffect(() => {
    const unsubscribe = subscribeToJob(jobId, {
      onProgress: (msg) => setProgress(msg.percentage),
      onStatus: (msg) => setStatus(msg.status),
    });

    return unsubscribe;
  }, [jobId, subscribeToJob]);

  return (
    <div>
      <p>Status: {status}</p>
      <progress value={progress} max={100} />
      <span>{progress}%</span>
    </div>
  );
}
```

## Topic Structure

All topics follow the pattern: `{prefix}/{userId}/...`

| Topic Pattern | Purpose | Message Type |
|--------------|---------|--------------|
| `{prefix}/{userId}/notifications` | User notifications | `NotificationMessage` |
| `{prefix}/{userId}/transactions` | Balance changes | `TransactionMessage` |
| `{prefix}/{userId}/jobs/{jobId}/progress` | Job progress updates | `JobProgressMessage` |
| `{prefix}/{userId}/jobs/{jobId}/status` | Job status changes | `JobStatusMessage` |

## Message Types

### NotificationMessage

```typescript
interface NotificationMessage {
  type: "job_completed" | "job_failed" | "refund" | "purchase" | "announcement" | "info" | "warning" | "error";
  title: string;
  message: string;
  action_url?: string;
  job_id?: string;
}
```

### TransactionMessage

```typescript
interface TransactionMessage {
  type: "extraction" | "refund" | "purchase" | "subscription" | "referral_bonus" | "admin_adjustment";
  amount: number;
  new_balance: number;
  description: string;
  reference_id?: string;
  timestamp: string;
}
```

### JobProgressMessage

```typescript
interface JobProgressMessage {
  job_id: string;
  current: number;
  total: number;
  percentage: number;
}
```

### JobStatusMessage

```typescript
interface JobStatusMessage {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "paused";
  file_url?: string;
  error?: string;
  total_count?: number;
}
```

## Connection States

| State | Description |
|-------|-------------|
| `disconnected` | Not connected |
| `connecting` | Connection in progress |
| `connected` | Successfully connected |
| `reconnecting` | Auto-reconnecting (network issue) |
| `auth_error` | Authentication failed (will auto-retry with fresh token) |
| `error` | Connection error (will auto-retry) |
| `no_token` | No Clerk token available (user not signed in) |

## Auto-Reconnect Behavior

The hook handles reconnection automatically:

1. **On Auth Error** (expired token): Destroys client, waits 3 seconds, gets fresh Clerk token, reconnects
2. **On Connection Loss**: Schedules reconnect after 3 seconds
3. **On Tab Visibility Change**: Reconnects when tab becomes visible if not connected
4. **On Sign Out**: Disconnects and clears state

### Manual Reconnect

```tsx
const { reconnect } = useMQTT();

// Force reconnection with fresh token
<button onClick={reconnect}>Reconnect</button>
```

## Debugging

Enable debug mode in development:

```tsx
<MQTTProvider debug={process.env.NODE_ENV === "development"}>
```

Console logs are prefixed with `[MQTT]` for easy filtering:

```
[MQTT] Getting Clerk token...
[MQTT] Creating CloudSignal client...
[MQTT] Connecting to CloudSignal...
[MQTT] Connection status: true
[MQTT] Subscribed to: myapp/user_xxx/notifications
[MQTT] Message received: myapp/user_xxx/notifications {...}
[MQTT] Auth error: Connection refused: Bad User Name or Password
[MQTT] Destroying client due to auth error...
[MQTT] Scheduling reconnect in 3000ms...
```

## Troubleshooting

### "Bad User Name or Password" on connect

1. **Check Clerk JWT Template**: Ensure the `email` claim is included
2. **Verify JWKS URL**: Make sure CloudSignal has the correct Clerk JWKS URL configured
3. **Check Organization ID**: Ensure `NEXT_PUBLIC_CLOUDSIGNAL_ORG_ID` matches your CloudSignal org

### Infinite reconnect loop

This example handles auth errors by:
1. Destroying the SDK client (stops its internal reconnect)
2. Waiting 3 seconds
3. Getting a fresh token from Clerk
4. Creating a new connection

If you're still seeing loops, check if Clerk is returning a valid token.

### Multiple connections in development

React 18's StrictMode double-mounts components. The hook uses refs (`connectingRef`, `mountedRef`) to prevent actual duplicate connections.

### Connection drops when tab is in background

This is normal browser behavior. The hook automatically reconnects when the tab becomes visible again.

## File Structure

```
nextjs-clerk/
├── README.md                 # This file
├── hooks/
│   └── use-mqtt.ts          # Core MQTT hook with Clerk integration
└── contexts/
    └── mqtt-context.tsx     # React Context with helper methods
```

## Publishing Messages (Backend)

From your backend, publish messages using CloudSignal's REST API:

```python
import httpx

async def publish_notification(user_id: str, title: str, message: str):
    topic = f"myapp/{user_id}/notifications"
    payload = {
        "type": "info",
        "title": title,
        "message": message,
    }
    
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://rest-publisher.cloudsignal.app/v1/publish",
            headers={
                "Authorization": f"Bearer {CLOUDSIGNAL_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "topic": topic,
                "payload": payload
            }
        )
```

## SDK Feature Requests

Based on real-world usage, these SDK improvements would help:

1. **`reconnectOnAuthError: false` option** - ✅ Added in v2.2.0
2. **Token refresh callback** for external IdPs:
   ```typescript
   new CloudSignal({
     onTokenExpired: async () => await getRefreshedToken(),
   });
   ```
3. **`maxAuthRetries` config** - ✅ Added in v2.2.0
4. **Better docs for external JWT handling** - This example!
