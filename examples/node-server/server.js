/**
 * CloudSignal Node.js Server Example
 * 
 * Long-running service that maintains a persistent MQTT connection.
 * Suitable for background workers, microservices, and IoT ingestion.
 * 
 * Usage:
 *   node server.js
 * 
 * Environment variables:
 *   CLOUDSIGNAL_ORG_ID      - Organization UUID
 *   CLOUDSIGNAL_SECRET_KEY  - API secret key (cs_live_xxx or cs_test_xxx)
 *   CLOUDSIGNAL_USER_EMAIL  - Service account email
 */

require("dotenv").config();
const CloudSignal = require("@cloudsignal/mqtt-client").default;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  organizationId: process.env.CLOUDSIGNAL_ORG_ID,
  secretKey: process.env.CLOUDSIGNAL_SECRET_KEY,
  userEmail: process.env.CLOUDSIGNAL_USER_EMAIL || "service@internal",
  // Use WebSocket for wider compatibility, or mqtts:// for native MQTT
  host: process.env.CLOUDSIGNAL_HOST || "wss://connect.cloudsignal.app:18885/",
  tokenServiceUrl: "https://auth.cloudsignal.app",
};

// Validate required config
if (!config.organizationId || !config.secretKey) {
  console.error("Error: CLOUDSIGNAL_ORG_ID and CLOUDSIGNAL_SECRET_KEY are required");
  console.error("Create a .env file with these values or set environment variables");
  process.exit(1);
}

// ============================================================================
// Initialize Client
// ============================================================================

const client = new CloudSignal({
  tokenServiceUrl: config.tokenServiceUrl,
  preset: "server",
  debug: process.env.NODE_ENV !== "production",
});

// ============================================================================
// Event Handlers
// ============================================================================

client.onConnectionStatusChange = (isConnected) => {
  console.log(`[CloudSignal] Connection status: ${isConnected ? "CONNECTED" : "DISCONNECTED"}`);
};

client.onReconnecting = (attempt) => {
  console.log(`[CloudSignal] Reconnecting... attempt #${attempt}`);
};

client.onAuthError = (error) => {
  console.error(`[CloudSignal] Authentication error: ${error.message}`);
  // In server preset, SDK will stop reconnecting on auth errors
  // You may want to alert your monitoring system here
};

// ============================================================================
// Message Handler
// ============================================================================

// Store topic handlers for easy routing
const handlers = new Map();

/**
 * Register a handler for a topic pattern
 * @param {string} topic - Topic or pattern (supports + and # wildcards)
 * @param {Function} handler - Async function(payload, topic)
 */
function onMessage(topic, handler) {
  handlers.set(topic, handler);
}

// Global message dispatcher
client.onMessage((topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message);
  } catch {
    payload = message;
  }

  // Find matching handler (exact match for now)
  const handler = handlers.get(topic);
  if (handler) {
    Promise.resolve(handler(payload, topic)).catch((err) => {
      console.error(`[Handler Error] ${topic}:`, err.message);
    });
  } else {
    console.log(`[CloudSignal] Received on ${topic}:`, payload);
  }
});

// ============================================================================
// Example Handlers
// ============================================================================

// Handle incoming commands
onMessage("commands/server", async (payload) => {
  console.log("Received command:", payload);
  
  // Process command and send response
  const result = { status: "ok", processed: payload };
  client.transmit("commands/server/response", result);
});

// Handle health checks
onMessage("health/ping", async () => {
  client.transmit("health/pong", {
    service: "node-server-example",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// ============================================================================
// Connect and Subscribe
// ============================================================================

async function start() {
  try {
    console.log("[CloudSignal] Connecting...");
    
    await client.connectWithToken({
      host: config.host,
      organizationId: config.organizationId,
      secretKey: config.secretKey,
      userEmail: config.userEmail,
    });

    console.log("[CloudSignal] Connected successfully");

    // Subscribe to topics
    await client.subscribe("commands/server", 1);
    await client.subscribe("health/ping", 0);
    
    console.log("[CloudSignal] Subscribed to topics");

    // Publish startup message
    client.transmit("events/service", {
      event: "service_started",
      service: "node-server-example",
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error("[CloudSignal] Failed to connect:", error.message);
    process.exit(1);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = async (signal) => {
  console.log(`\n[CloudSignal] Received ${signal}, shutting down...`);
  
  // Publish shutdown message
  try {
    client.transmit("events/service", {
      event: "service_stopped",
      service: "node-server-example",
      timestamp: Date.now(),
    });
    
    // Give time for message to send
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Ignore errors during shutdown
  }
  
  client.destroy();
  console.log("[CloudSignal] Disconnected");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ============================================================================
// Start Server
// ============================================================================

start();
