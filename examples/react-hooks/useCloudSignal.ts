/**
 * CloudSignal React Hook
 * 
 * Framework-agnostic React hook for CloudSignal MQTT.
 * Works with Create React App, Vite, Next.js, Remix, etc.
 * 
 * @example
 * ```tsx
 * import { useCloudSignal } from "./useCloudSignal";
 * 
 * function App() {
 *   const { isConnected, connect, subscribe, publish, messages } = useCloudSignal();
 *   
 *   useEffect(() => {
 *     connect({
 *       host: "wss://connect.cloudsignal.app:18885/",
 *       username: "user@org_xxx",
 *       password: "token",
 *     });
 *   }, []);
 *   
 *   return <div>{isConnected ? "Connected" : "Disconnected"}</div>;
 * }
 * ```
 */

import { useEffect, useRef, useState, useCallback } from "react";
import CloudSignal from "@cloudsignal/mqtt-client";

// ============================================================================
// Types
// ============================================================================

interface CloudSignalClient {
  connect(config: ConnectionConfig): Promise<void>;
  connectWithToken(config: TokenConfig): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  transmit(topic: string, message: string | object, options?: PublishOptions): void;
  destroy(): void;
  onMessage(handler: (topic: string, message: string) => void): void;
  onConnectionStatusChange: ((connected: boolean) => void) | null;
  onReconnecting: ((attempt: number) => void) | null;
  onAuthError: ((error: Error) => void) | null;
}

export interface ConnectionConfig {
  host: string;
  username: string;
  password: string;
  clientId?: string;
}

export interface TokenConfig {
  host: string;
  organizationId: string;
  secretKey?: string;
  userEmail?: string;
  externalToken?: string;
  clientId?: string;
}

export interface PublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface Message {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

export interface UseCloudSignalOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Token service URL for token-based auth */
  tokenServiceUrl?: string;
  /** Platform preset */
  preset?: "mobile" | "desktop" | "agent" | "server";
  /** Maximum messages to store (default: 100) */
  maxMessages?: number;
}

export interface UseCloudSignalReturn {
  /** Whether connected to the broker */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Current reconnection attempt (0 if not reconnecting) */
  reconnectAttempt: number;
  /** Last error that occurred */
  error: Error | null;
  /** Received messages (newest first) */
  messages: Message[];
  /** Connect with username/password */
  connect: (config: ConnectionConfig) => Promise<void>;
  /** Connect with token authentication */
  connectWithToken: (config: TokenConfig) => Promise<void>;
  /** Disconnect from the broker */
  disconnect: () => void;
  /** Subscribe to a topic */
  subscribe: (topic: string, qos?: 0 | 1 | 2) => Promise<void>;
  /** Unsubscribe from a topic */
  unsubscribe: (topic: string) => Promise<void>;
  /** Publish a message */
  publish: (topic: string, message: unknown, options?: PublishOptions) => void;
  /** Clear stored messages */
  clearMessages: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCloudSignal(options: UseCloudSignalOptions = {}): UseCloudSignalReturn {
  const {
    debug = false,
    tokenServiceUrl,
    preset = "desktop",
    maxMessages = 100,
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Refs for StrictMode safety
  const clientRef = useRef<CloudSignalClient | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);

  // Logging helper
  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[useCloudSignal]", ...args);
    },
    [debug]
  );

  // Add message to state
  const addMessage = useCallback(
    (topic: string, payload: unknown) => {
      setMessages((prev) => {
        const newMsg: Message = { topic, payload, receivedAt: Date.now() };
        return [newMsg, ...prev].slice(0, maxMessages);
      });
    },
    [maxMessages]
  );

  // Create and configure client
  const createClient = useCallback(() => {
    const clientOptions: Record<string, unknown> = {
      debug,
      preset,
    };
    if (tokenServiceUrl) {
      clientOptions.tokenServiceUrl = tokenServiceUrl;
    }

    const client = new CloudSignal(clientOptions) as unknown as CloudSignalClient;

    // Event handlers
    client.onConnectionStatusChange = (connected: boolean) => {
      log("Connection status:", connected);
      if (mountedRef.current) {
        setIsConnected(connected);
        if (connected) setReconnectAttempt(0);
      }
    };

    client.onReconnecting = (attempt: number) => {
      log("Reconnecting, attempt:", attempt);
      if (mountedRef.current) setReconnectAttempt(attempt);
    };

    client.onAuthError = (err: Error) => {
      log("Auth error:", err.message);
      if (mountedRef.current) {
        setError(err);
        setIsConnected(false);
      }
      clientRef.current = null;
    };

    // Message handler
    client.onMessage((topic: string, message: string) => {
      log("Message on", topic);
      try {
        addMessage(topic, JSON.parse(message));
      } catch {
        addMessage(topic, message);
      }
    });

    return client;
  }, [debug, preset, tokenServiceUrl, log, addMessage]);

  // Connect with credentials
  const connect = useCallback(
    async (config: ConnectionConfig) => {
      if (connectingRef.current || clientRef.current) {
        log("Already connecting or connected");
        return;
      }

      connectingRef.current = true;
      setIsConnecting(true);
      setError(null);

      try {
        const client = createClient();
        await client.connect(config);

        if (!mountedRef.current) {
          client.destroy();
          return;
        }

        clientRef.current = client;
        log("Connected successfully");
      } catch (err) {
        log("Connection failed:", err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        connectingRef.current = false;
        if (mountedRef.current) setIsConnecting(false);
      }
    },
    [createClient, log]
  );

  // Connect with token auth
  const connectWithToken = useCallback(
    async (config: TokenConfig) => {
      if (connectingRef.current || clientRef.current) {
        log("Already connecting or connected");
        return;
      }

      if (!tokenServiceUrl) {
        throw new Error("tokenServiceUrl required for connectWithToken");
      }

      connectingRef.current = true;
      setIsConnecting(true);
      setError(null);

      try {
        const client = createClient();
        await client.connectWithToken(config);

        if (!mountedRef.current) {
          client.destroy();
          return;
        }

        clientRef.current = client;
        log("Connected with token successfully");
      } catch (err) {
        log("Token connection failed:", err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        connectingRef.current = false;
        if (mountedRef.current) setIsConnecting(false);
      }
    },
    [createClient, tokenServiceUrl, log]
  );

  // Disconnect
  const disconnect = useCallback(() => {
    log("Disconnecting");
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    setIsConnected(false);
    setReconnectAttempt(0);
  }, [log]);

  // Subscribe
  const subscribe = useCallback(
    async (topic: string, qos: 0 | 1 | 2 = 1) => {
      if (!clientRef.current) throw new Error("Not connected");
      await clientRef.current.subscribe(topic, qos);
      log("Subscribed to:", topic);
    },
    [log]
  );

  // Unsubscribe
  const unsubscribe = useCallback(
    async (topic: string) => {
      if (!clientRef.current) throw new Error("Not connected");
      await clientRef.current.unsubscribe(topic);
      log("Unsubscribed from:", topic);
    },
    [log]
  );

  // Publish
  const publish = useCallback(
    (topic: string, message: unknown, options?: PublishOptions) => {
      if (!clientRef.current) {
        log("Cannot publish: not connected");
        return;
      }
      const payload = typeof message === "string" ? message : JSON.stringify(message);
      clientRef.current.transmit(topic, payload, options);
      log("Published to:", topic);
    },
    [log]
  );

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    reconnectAttempt,
    error,
    messages,
    connect,
    connectWithToken,
    disconnect,
    subscribe,
    unsubscribe,
    publish,
    clearMessages,
  };
}

export default useCloudSignal;
