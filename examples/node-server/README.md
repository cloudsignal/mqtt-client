# CloudSignal Node.js Server Example

Backend service example using CloudSignal MQTT with native TCP/TLS transport.

## Use Cases

- Publishing messages from your API
- IoT data ingestion
- Background job notifications
- Microservice communication

## Setup

```bash
npm install @cloudsignal/mqtt-client dotenv
```

## Environment Variables

Create `.env`:

```env
CLOUDSIGNAL_ORG_ID=your-org-uuid
CLOUDSIGNAL_SECRET_KEY=cs_live_xxxxx
CLOUDSIGNAL_USER_EMAIL=service@yourcompany.com
```

## Files

- `server.js` - Basic server example with publish/subscribe
- `publisher.js` - Standalone message publisher (stateless)
- `subscriber.js` - Standalone message consumer

## Quick Start

### Option 1: Long-Running Service

For services that need to maintain a persistent connection:

```bash
node server.js
```

### Option 2: Fire-and-Forget Publishing

For APIs or serverless functions that just need to publish:

```bash
node publisher.js "my/topic" '{"event": "order_created", "id": 123}'
```

## Examples

### Express.js Integration

```javascript
const express = require("express");
const { createPublisher } = require("./publisher");

const app = express();
const publisher = createPublisher();

app.post("/api/notify", async (req, res) => {
  await publisher.publish("notifications/new", req.body);
  res.json({ success: true });
});

app.listen(3000);
```

### Background Worker

```javascript
const { createSubscriber } = require("./subscriber");

const subscriber = createSubscriber();

subscriber.on("jobs/pending", async (job) => {
  console.log("Processing job:", job.id);
  await processJob(job);
  subscriber.publish("jobs/completed", { id: job.id, status: "done" });
});

subscriber.start();
```

## Authentication

### Native (Secret Key)

The server preset uses your organization's secret key for authentication. This is the recommended approach for backend services.

```javascript
await client.connectWithToken({
  host: "mqtts://connect.cloudsignal.app:8883/",  // TLS port
  organizationId: process.env.CLOUDSIGNAL_ORG_ID,
  secretKey: process.env.CLOUDSIGNAL_SECRET_KEY,
  userEmail: process.env.CLOUDSIGNAL_USER_EMAIL,
});
```

### Service Account Pattern

For microservices, create a dedicated service account email:

```env
CLOUDSIGNAL_USER_EMAIL=service-orders@yourcompany.internal
```

This helps with audit logging and access control.

## Transport Options

### WebSocket (Default)

Works through firewalls and proxies:

```javascript
host: "wss://connect.cloudsignal.app:18885/"
```

### Native MQTT over TLS

Lower latency, recommended when direct TCP is available:

```javascript
host: "mqtts://connect.cloudsignal.app:8883/"
```

## Graceful Shutdown

Always handle process signals for clean disconnection:

```javascript
const shutdown = async () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

## Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
services:
  mqtt-worker:
    build: .
    environment:
      - CLOUDSIGNAL_ORG_ID
      - CLOUDSIGNAL_SECRET_KEY
      - CLOUDSIGNAL_USER_EMAIL
    restart: unless-stopped
```

## Error Handling

The server preset has unlimited reconnect attempts by default. For services where you want to fail fast:

```javascript
const client = new CloudSignal({
  preset: "server",
  maxReconnectAttempts: 10,  // Give up after 10 attempts
});
```
