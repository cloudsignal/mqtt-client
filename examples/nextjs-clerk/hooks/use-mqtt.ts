/**
 * CloudSignal MQTT Hook for Next.js + Clerk
 *
 * This hook handles MQTT connection with Clerk JWT authentication, including:
 * - Automatic token refresh handling
 * - React StrictMode compatibility (no double-connect issues)
 * - Auth error recovery with fresh token
 * - Connection state management
 *
 * @example
 * ```tsx
 * import { useMQTT } from "@/hooks/use-mqtt";
 *
 * function MyComponent() {
 *   const { isConnected, connectionState, error } = useMQTT();
 *   return <p>Status: {connectionState}</p>;
 * }
 * ```
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import CloudSignal from "@cloudsignal/mqtt-client";

// ============================================================================
// Types
// ============================================================================

interface CloudSignalClient {
  connectWithToken(options: {
    host: string;
    organizationId: string;
    externalToken: string;
  }): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  transmit(
    topic: string,
    message: string | object,
    options?: { qos?: 0 | 1 | 2; retain?: boolean }
  ): void;
  destroy(): void;
  onMessage(handler: (topic: string, message: string) => void): void;
  onConnectionStatusChange: ((connected: boolean) => void) | null;
  onReconnecting: ((attempt: number) => void) | null;
  onAuthError: ((error: Error) => void) | null;
}

export interface MQTTMessage {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

/**
 * Connection state enum for detailed status tracking
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_error"
  | "error"
  | "no_token";

export interface UseMQTTOptions {
  /** Enable debug logging (prefix: [MQTT]) */
  debug?: boolean;
  /** Auto-connect when Clerk session is available */
  autoConnect?: boolean;
  /** Topics to subscribe to on connect */
  initialTopics?: string[];
  /** Delay before reconnecting after auth error (ms) */
  reconnectDelay?: number;
}

export interface UseMQTTReturn {
  /** Whether the client is connected */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Detailed connection state */
  connectionState: ConnectionState;
  /** Current reconnection attempt number (0 if not reconnecting) */
  reconnectAttempt: number;
  /** Last error that occurred */
  error: Error | null;
  /** Messages received (most recent first) */
  messages: MQTTMessage[];
  /** Subscribe to a topic */
  subscribe: (topic: string, qos?: 0 | 1 | 2) => Promise<void>;
  /** Unsubscribe from a topic */
  unsubscribe: (topic: string) => Promise<void>;
  /** Publish a message */
  publish: (
    topic: string,
    message: unknown,
    options?: { qos?: 0 | 1 | 2; retain?: boolean }
  ) => void;
  /** Force reconnect with fresh token */
  reconnect: () => Promise<void>;
  /** Disconnect from the broker */
  disconnect: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const CLOUDSIGNAL_TOKEN_SERVICE = "https://auth.cloudsignal.app";
const CLOUDSIGNAL_MQTT_HOST =
  process.env.NEXT_PUBLIC_CLOUDSIGNAL_HOST ||
  "wss://connect.cloudsignal.app:18885/";
const CLOUDSIGNAL_ORG_ID = process.env.NEXT_PUBLIC_CLOUDSIGNAL_ORG_ID!;
const MAX_STORED_MESSAGES = 100;
const DEFAULT_RECONNECT_DELAY = 3000;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMQTT(options: UseMQTTOptions = {}): UseMQTTReturn {
  const {
    debug = false,
    autoConnect = true,
    initialTopics = [],
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
  } = options;

  // Clerk hooks
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<MQTTMessage[]>([]);

  // Refs for connection management (prevents StrictMode double-connect)
  const clientRef = useRef<CloudSignalClient | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);
  const subscribedTopicsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Log helper
  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) {
        console.log("[MQTT]", ...args);
      }
    },
    [debug]
  );

  // Add message to state
  const addMessage = useCallback((topic: string, payload: unknown) => {
    setMessages((prev) => {
      const newMessage: MQTTMessage = {
        topic,
        payload,
        receivedAt: Date.now(),
      };
      return [newMessage, ...prev].slice(0, MAX_STORED_MESSAGES);
    });
  }, []);

  // Clear any pending reconnect
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Schedule reconnect
  const scheduleReconnect = useCallback(
    (connectFn: () => Promise<void>) => {
      clearReconnectTimeout();
      log(`Scheduling reconnect in ${reconnectDelay}ms...`);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectFn();
        }
      }, reconnectDelay);
    },
    [reconnectDelay, clearReconnectTimeout, log]
  );

  // Core connect function
  const connect = useCallback(async () => {
    // Guard: prevent concurrent connection attempts
    if (connectingRef.current) {
      log("Connection already in progress, skipping");
      return;
    }

    // Guard: already connected
    if (clientRef.current) {
      log("Already connected, skipping");
      return;
    }

    // Check if Clerk is loaded
    if (!isLoaded) {
      log("Clerk not loaded yet, skipping");
      return;
    }

    // Check if signed in
    if (!isSignedIn) {
      log("User not signed in, skipping connection");
      setConnectionState("no_token");
      return;
    }

    connectingRef.current = true;
    setIsConnecting(true);
    setConnectionState("connecting");
    setError(null);

    try {
      // Get fresh Clerk token
      log("Getting Clerk token...");
      const token = await getToken();

      if (!token) {
        log("No token available from Clerk");
        setConnectionState("no_token");
        return;
      }

      log("Creating CloudSignal client...");

      const client = new CloudSignal({
        tokenServiceUrl: CLOUDSIGNAL_TOKEN_SERVICE,
        preset: "desktop",
        debug,
        // Disable SDK's internal reconnect on auth errors - we handle it ourselves
        reconnectOnAuthError: false,
      }) as unknown as CloudSignalClient;

      // Set up event handlers BEFORE connecting
      client.onConnectionStatusChange = (connected: boolean) => {
        log("Connection status:", connected);
        if (mountedRef.current) {
          setIsConnected(connected);
          setConnectionState(connected ? "connected" : "disconnected");
          if (connected) {
            setReconnectAttempt(0);
          }
        }
      };

      client.onReconnecting = (attempt: number) => {
        log("Reconnecting, attempt:", attempt);
        if (mountedRef.current) {
          setReconnectAttempt(attempt);
          setConnectionState("reconnecting");
        }
      };

      client.onAuthError = (err: Error) => {
        log("Auth error:", err.message);
        if (mountedRef.current) {
          setError(err);
          setIsConnected(false);
          setConnectionState("auth_error");
        }

        // IMPORTANT: On auth error, destroy the client to stop SDK's internal reconnect
        // Then schedule a reconnect with fresh token from Clerk
        log("Destroying client due to auth error...");
        client.destroy();
        clientRef.current = null;
        connectingRef.current = false;

        // Schedule reconnect with fresh token
        scheduleReconnect(connect);
      };

      // Set up message handler
      client.onMessage((topic: string, message: string) => {
        log("Message received:", topic);
        try {
          const payload = JSON.parse(message);
          addMessage(topic, payload);
        } catch {
          addMessage(topic, message);
        }
      });

      // Connect with Clerk token
      log("Connecting to CloudSignal...");
      await client.connectWithToken({
        host: CLOUDSIGNAL_MQTT_HOST,
        organizationId: CLOUDSIGNAL_ORG_ID,
        externalToken: token,
      });

      // Check if still mounted (StrictMode may have unmounted during async)
      if (!mountedRef.current) {
        log("Component unmounted during connection, cleaning up");
        client.destroy();
        return;
      }

      // Store client reference
      clientRef.current = client;
      log("Connected successfully");

      // Subscribe to initial topics
      for (const topic of initialTopics) {
        try {
          await client.subscribe(topic);
          subscribedTopicsRef.current.add(topic);
          log("Subscribed to:", topic);
        } catch (subError) {
          log("Failed to subscribe to", topic, subError);
        }
      }
    } catch (err) {
      log("Connection failed:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnected(false);
        setConnectionState("error");

        // Schedule reconnect
        scheduleReconnect(connect);
      }
    } finally {
      connectingRef.current = false;
      if (mountedRef.current) {
        setIsConnecting(false);
      }
    }
  }, [
    debug,
    isLoaded,
    isSignedIn,
    getToken,
    log,
    addMessage,
    initialTopics,
    scheduleReconnect,
  ]);

  // Disconnect function
  const disconnect = useCallback(() => {
    log("Disconnecting...");
    clearReconnectTimeout();
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    subscribedTopicsRef.current.clear();
    setIsConnected(false);
    setConnectionState("disconnected");
    setReconnectAttempt(0);
  }, [log, clearReconnectTimeout]);

  // Force reconnect with fresh token
  const reconnect = useCallback(async () => {
    log("Force reconnect requested");
    clearReconnectTimeout();
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    connectingRef.current = false;
    await connect();
  }, [connect, clearReconnectTimeout, log]);

  // Subscribe function
  const subscribe = useCallback(
    async (topic: string, qos: 0 | 1 | 2 = 1) => {
      if (!clientRef.current) {
        throw new Error("Not connected");
      }
      await clientRef.current.subscribe(topic, qos);
      subscribedTopicsRef.current.add(topic);
      log("Subscribed to:", topic);
    },
    [log]
  );

  // Unsubscribe function
  const unsubscribe = useCallback(
    async (topic: string) => {
      if (!clientRef.current) {
        throw new Error("Not connected");
      }
      await clientRef.current.unsubscribe(topic);
      subscribedTopicsRef.current.delete(topic);
      log("Unsubscribed from:", topic);
    },
    [log]
  );

  // Publish function
  const publish = useCallback(
    (
      topic: string,
      message: unknown,
      options?: { qos?: 0 | 1 | 2; retain?: boolean }
    ) => {
      if (!clientRef.current) {
        log("Cannot publish: not connected");
        return;
      }
      const payload =
        typeof message === "string" ? message : JSON.stringify(message);
      clientRef.current.transmit(topic, payload, options);
      log("Published to:", topic);
    },
    [log]
  );

  // Effect: Auto-connect when Clerk auth changes
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect && isLoaded && isSignedIn) {
      connect();
    }

    // Disconnect when user signs out
    if (isLoaded && !isSignedIn && clientRef.current) {
      log("User signed out, disconnecting...");
      disconnect();
    }

    return () => {
      mountedRef.current = false;
      clearReconnectTimeout();
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, [autoConnect, isLoaded, isSignedIn, connect, disconnect, clearReconnectTimeout, log]);

  // Effect: Reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        !clientRef.current &&
        !connectingRef.current &&
        isSignedIn
      ) {
        log("Tab became visible, reconnecting...");
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [connect, isSignedIn, log]);

  return {
    isConnected,
    isConnecting,
    connectionState,
    reconnectAttempt,
    error,
    messages,
    subscribe,
    unsubscribe,
    publish,
    reconnect,
    disconnect,
  };
}

export default useMQTT;
