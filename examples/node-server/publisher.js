/**
 * CloudSignal Standalone Publisher
 * 
 * Fire-and-forget message publisher for APIs and scripts.
 * Connects, publishes, then disconnects.
 * 
 * CLI Usage:
 *   node publisher.js <topic> <json-message>
 *   node publisher.js "notifications/new" '{"user": "123", "text": "Hello"}'
 * 
 * Module Usage:
 *   const { publish, createPublisher } = require("./publisher");
 *   await publish("my/topic", { data: "value" });
 */

require("dotenv").config();
const CloudSignal = require("@cloudsignal/mqtt-client").default;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  organizationId: process.env.CLOUDSIGNAL_ORG_ID,
  secretKey: process.env.CLOUDSIGNAL_SECRET_KEY,
  userEmail: process.env.CLOUDSIGNAL_USER_EMAIL || "publisher@internal",
  host: process.env.CLOUDSIGNAL_HOST || "wss://connect.cloudsignal.app:18885/",
  tokenServiceUrl: "https://auth.cloudsignal.app",
};

// ============================================================================
// Shared Client (for multiple publishes)
// ============================================================================

let sharedClient = null;
let connectionPromise = null;

/**
 * Get or create a shared client connection
 * Reuses the same connection for multiple publishes
 */
async function getClient() {
  if (sharedClient?.isConnected()) {
    return sharedClient;
  }

  if (connectionPromise) {
    await connectionPromise;
    return sharedClient;
  }

  connectionPromise = (async () => {
    const client = new CloudSignal({
      tokenServiceUrl: config.tokenServiceUrl,
      preset: "server",
      debug: false,
    });

    await client.connectWithToken({
      host: config.host,
      organizationId: config.organizationId,
      secretKey: config.secretKey,
      userEmail: config.userEmail,
    });

    sharedClient = client;
  })();

  await connectionPromise;
  connectionPromise = null;
  return sharedClient;
}

/**
 * Publish a message (connects if needed, reuses connection)
 * 
 * @param {string} topic - MQTT topic
 * @param {object|string} message - Message payload (will be JSON stringified)
 * @param {object} options - Publish options
 * @param {number} options.qos - Quality of Service (0, 1, or 2)
 * @param {boolean} options.retain - Retain message on broker
 * @returns {Promise<void>}
 */
async function publish(topic, message, options = {}) {
  const client = await getClient();
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  client.transmit(topic, payload, options);
}

/**
 * Publish and immediately disconnect
 * Use for one-off publishes where you don't want to keep connection open
 * 
 * @param {string} topic - MQTT topic
 * @param {object|string} message - Message payload
 * @param {object} options - Publish options
 * @returns {Promise<void>}
 */
async function publishOnce(topic, message, options = { qos: 1 }) {
  const client = new CloudSignal({
    tokenServiceUrl: config.tokenServiceUrl,
    preset: "server",
    debug: false,
  });

  try {
    await client.connectWithToken({
      host: config.host,
      organizationId: config.organizationId,
      secretKey: config.secretKey,
      userEmail: config.userEmail,
    });

    const payload = typeof message === "string" ? message : JSON.stringify(message);
    client.transmit(topic, payload, options);

    // Wait a bit for QoS handshake
    if (options.qos > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    client.destroy();
  }
}

/**
 * Create a publisher instance for Express/Fastify integration
 * Manages connection lifecycle automatically
 * 
 * @returns {{ publish: Function, disconnect: Function }}
 */
function createPublisher() {
  return {
    publish,
    publishOnce,
    disconnect: () => {
      if (sharedClient) {
        sharedClient.destroy();
        sharedClient = null;
      }
    },
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const [topic, messageArg] = process.argv.slice(2);

  if (!topic) {
    console.log("Usage: node publisher.js <topic> [json-message]");
    console.log('Example: node publisher.js "test/topic" \'{"hello": "world"}\'');
    process.exit(1);
  }

  if (!config.organizationId || !config.secretKey) {
    console.error("Error: CLOUDSIGNAL_ORG_ID and CLOUDSIGNAL_SECRET_KEY required");
    process.exit(1);
  }

  let message;
  try {
    message = messageArg ? JSON.parse(messageArg) : { timestamp: Date.now() };
  } catch {
    message = messageArg || { timestamp: Date.now() };
  }

  console.log(`Publishing to "${topic}":`, message);

  try {
    await publishOnce(topic, message);
    console.log("Published successfully");
  } catch (error) {
    console.error("Publish failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  publish,
  publishOnce,
  createPublisher,
  getClient,
};
