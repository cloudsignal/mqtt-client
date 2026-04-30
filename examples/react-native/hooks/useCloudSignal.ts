/**
 * CloudSignal React Native Hook
 * 
 * Mobile-optimized hook with app state handling and offline queue support.
 * Uses the 'mobile' preset for battery-friendly operation.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
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
  isConnected(): boolean;
  forceReconnect(): void;
  onMessage(handler: (topic: string, message: string) => void): void;
  onConnectionStatusChange: ((connected: boolean) => void) | null;
  onReconnecting: ((attempt: number) => void) | null;
  onAuthError: ((error: Error) => void) | null;
  onOffline: (() => void) | null;
  onOnline: (() => void) | null;
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
  read?: boolean;
}

export interface UseCloudSignalOptions {
  debug?: boolean;
  tokenServiceUrl?: string;
  maxMessages?: number;
  /** Reconnect when app returns to foreground (default: true) */
  reconnectOnForeground?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TOKEN_SERVICE_URL = "https://auth.cloudsignal.app";
const MAX_MESSAGES_DEFAULT = 100;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCloudSignal(options: UseCloudSignalOptions = {}) {
  const {
    debug = false,
    tokenServiceUrl = TOKEN_SERVICE_URL,
    maxMessages = MAX_MESSAGES_DEFAULT,
    reconnectOnForeground = true,
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  // Refs
  const clientRef = useRef<CloudSignalClient | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastCredentialsRef = useRef<TokenConfig | ConnectionConfig | null>(null);

  // Logging
  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log("[CloudSignal]", ...args);
    },
    [debug]
  );

  // Add message
  const addMessage = useCallback(
    (topic: string, payload: unknown) => {
      setMessages((prev) => {
        const msg: Message = { topic, payload, receivedAt: Date.now(), read: false };
        return [msg, ...prev].slice(0, maxMessages);
      });
    },
    [maxMessages]
  );

  // Create client with mobile preset
  const createClient = useCallback(() => {
    const client = new CloudSignal({
      tokenServiceUrl,
      preset: "mobile", // Mobile-optimized settings
      debug,
    }) as unknown as CloudSignalClient;

    client.onConnectionStatusChange = (connected: boolean) => {
      log("Connection:", connected);
      if (mountedRef.current) {
        setIsConnected(connected);
        if (connected) setReconnectAttempt(0);
      }
    };

    client.onReconnecting = (attempt: number) => {
      log("Reconnecting:", attempt);
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

    client.onOffline = () => {
      log("Offline");
    };

    client.onOnline = () => {
      log("Online");
    };

    client.onMessage((topic: string, message: string) => {
      log("Message:", topic);
      try {
        addMessage(topic, JSON.parse(message));
      } catch {
        addMessage(topic, message);
      }
    });

    return client;
  }, [debug, tokenServiceUrl, log, addMessage]);

  // Connect with credentials
  const connect = useCallback(
    async (config: ConnectionConfig) => {
      if (connectingRef.current || clientRef.current) return;

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
        lastCredentialsRef.current = config;
        log("Connected");
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

  // Connect with token
  const connectWithToken = useCallback(
    async (config: TokenConfig) => {
      if (connectingRef.current || clientRef.current) return;

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
        lastCredentialsRef.current = config;
        log("Connected with token");
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
    [createClient, log]
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

  // Reconnect with stored credentials
  const reconnect = useCallback(
    async (newToken?: string) => {
      if (!lastCredentialsRef.current) {
        log("No stored credentials for reconnect");
        return;
      }

      // Disconnect existing
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }

      // Update token if provided
      if (newToken && "externalToken" in lastCredentialsRef.current) {
        lastCredentialsRef.current.externalToken = newToken;
      }

      // Reconnect
      if ("externalToken" in lastCredentialsRef.current || "secretKey" in lastCredentialsRef.current) {
        await connectWithToken(lastCredentialsRef.current as TokenConfig);
      } else {
        await connect(lastCredentialsRef.current as ConnectionConfig);
      }
    },
    [connect, connectWithToken, log]
  );

  // Subscribe
  const subscribe = useCallback(
    async (topic: string, qos: 0 | 1 | 2 = 1) => {
      if (!clientRef.current) throw new Error("Not connected");
      await clientRef.current.subscribe(topic, qos);
      log("Subscribed:", topic);
    },
    [log]
  );

  // Unsubscribe
  const unsubscribe = useCallback(
    async (topic: string) => {
      if (!clientRef.current) throw new Error("Not connected");
      await clientRef.current.unsubscribe(topic);
      log("Unsubscribed:", topic);
    },
    [log]
  );

  // Publish
  const publish = useCallback(
    (topic: string, message: unknown, options?: PublishOptions) => {
      if (!clientRef.current) {
        log("Cannot publish: not connected (message will be queued if offline queue enabled)");
        return;
      }
      const payload = typeof message === "string" ? message : JSON.stringify(message);
      clientRef.current.transmit(topic, payload, options);
      log("Published:", topic);
    },
    [log]
  );

  // Mark messages as read
  const markAsRead = useCallback((topics?: string[]) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (!topics || topics.includes(msg.topic)) {
          return { ...msg, read: true };
        }
        return msg;
      })
    );
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => setMessages([]), []);

  // App state handling
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      log("App state:", nextState);
      setAppState(nextState);

      if (reconnectOnForeground && nextState === "active" && !isConnected && lastCredentialsRef.current) {
        log("App foregrounded, reconnecting...");
        reconnect();
      }
    });

    return () => subscription.remove();
  }, [isConnected, reconnect, reconnectOnForeground, log]);

  // Cleanup
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
    // State
    isConnected,
    isConnecting,
    reconnectAttempt,
    error,
    messages,
    appState,

    // Connection
    connect,
    connectWithToken,
    disconnect,
    reconnect,

    // Messaging
    subscribe,
    unsubscribe,
    publish,

    // Utilities
    markAsRead,
    clearMessages,
  };
}

export default useCloudSignal;
