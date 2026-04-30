/**
 * CloudSignal MQTT Hook for React/Next.js
 * 
 * This hook handles MQTT connection with proper guards for React StrictMode
 * and automatic reconnection on token refresh.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import CloudSignal from "@cloudsignal/mqtt-client";
import { supabase } from "@/lib/supabase";

// Type definitions for the SDK (until official types are published)
interface CloudSignalClient {
  connectWithToken(options: {
    host: string;
    organizationId: string;
    externalToken: string;
  }): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  transmit(topic: string, message: string | object, options?: { qos?: 0 | 1 | 2; retain?: boolean }): void;
  destroy(): void;
  onMessage(handler: (topic: string, message: string) => void): void;
  onConnectionStatusChange: ((connected: boolean) => void) | null;
  onReconnecting: ((attempt: number) => void) | null;
  onAuthError: ((error: Error) => void) | null;
}

interface MQTTMessage {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

interface UseMQTTOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-connect when session is available */
  autoConnect?: boolean;
  /** Topics to subscribe to on connect */
  initialTopics?: string[];
}

interface UseMQTTReturn {
  /** Whether the client is connected */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
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
  publish: (topic: string, message: unknown, options?: { qos?: 0 | 1 | 2; retain?: boolean }) => void;
  /** Manually connect (usually not needed with autoConnect) */
  connect: () => Promise<void>;
  /** Disconnect and cleanup */
  disconnect: () => void;
}

const CLOUDSIGNAL_TOKEN_SERVICE = "https://auth.cloudsignal.app";
const CLOUDSIGNAL_MQTT_HOST = "wss://connect.cloudsignal.app:18885/";
const MAX_STORED_MESSAGES = 100;

export function useMQTT(options: UseMQTTOptions = {}): UseMQTTReturn {
  const { debug = false, autoConnect = true, initialTopics = [] } = options;

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<MQTTMessage[]>([]);

  // Refs for connection management (prevents StrictMode double-connect)
  const clientRef = useRef<CloudSignalClient | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);
  const subscribedTopicsRef = useRef<Set<string>>(new Set());

  // Log helper
  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) {
        console.log("[useMQTT]", ...args);
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
      // Keep only the most recent messages
      return [newMessage, ...prev].slice(0, MAX_STORED_MESSAGES);
    });
  }, []);

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

    // Get current session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      log("No session available, skipping connection");
      return;
    }

    connectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      log("Creating CloudSignal client...");

      const client = new CloudSignal({
        tokenServiceUrl: CLOUDSIGNAL_TOKEN_SERVICE,
        preset: "desktop",
        debug,
      }) as unknown as CloudSignalClient;

      // Set up event handlers BEFORE connecting
      client.onConnectionStatusChange = (connected: boolean) => {
        log("Connection status changed:", connected);
        if (mountedRef.current) {
          setIsConnected(connected);
          setReconnectAttempt(0);
        }
      };

      client.onReconnecting = (attempt: number) => {
        log("Reconnecting, attempt:", attempt);
        if (mountedRef.current) {
          setReconnectAttempt(attempt);
        }
      };

      client.onAuthError = (err: Error) => {
        log("Auth error:", err.message);
        if (mountedRef.current) {
          setError(err);
          setIsConnected(false);
        }
        // SDK v2.2.0+ automatically stops reconnect on auth errors
        // Clean up our reference so a new connection can be made
        clientRef.current = null;
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

      // Connect with Supabase token
      log("Connecting with token...");
      await client.connectWithToken({
        host: CLOUDSIGNAL_MQTT_HOST,
        organizationId: process.env.NEXT_PUBLIC_CLOUDSIGNAL_ORG_ID!,
        externalToken: session.access_token,
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
      }
    } finally {
      connectingRef.current = false;
      if (mountedRef.current) {
        setIsConnecting(false);
      }
    }
  }, [debug, log, addMessage, initialTopics]);

  // Disconnect function
  const disconnect = useCallback(() => {
    log("Disconnecting...");
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    subscribedTopicsRef.current.clear();
    setIsConnected(false);
    setReconnectAttempt(0);
  }, [log]);

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
    (topic: string, message: unknown, options?: { qos?: 0 | 1 | 2; retain?: boolean }) => {
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

  // Effect: Auto-connect and handle token refresh
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      connect();
    }

    // Listen for Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      log("Auth state changed:", event);

      if (event === "SIGNED_OUT") {
        disconnect();
      } else if (event === "TOKEN_REFRESHED" && session) {
        // Token was refreshed - reconnect with new token
        log("Token refreshed, reconnecting...");
        disconnect();
        // Small delay to ensure cleanup completes
        setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, 100);
      } else if (event === "SIGNED_IN" && !clientRef.current) {
        connect();
      }
    });

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      disconnect();
    };
  }, [autoConnect, connect, disconnect, log]);

  return {
    isConnected,
    isConnecting,
    reconnectAttempt,
    error,
    messages,
    subscribe,
    unsubscribe,
    publish,
    connect,
    disconnect,
  };
}

export default useMQTT;
