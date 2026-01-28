/**
 * CloudSignal MQTT Context for Next.js + Clerk
 *
 * Provides MQTT connection state and helper methods to all components via React Context.
 * Includes typed handlers for notifications, transactions, and job progress tracking.
 *
 * @example
 * ```tsx
 * // app/providers.tsx
 * import { MQTTProvider } from "@/contexts/mqtt-context";
 *
 * export function Providers({ children }) {
 *   return (
 *     <ClerkProvider>
 *       <MQTTProvider>
 *         {children}
 *       </MQTTProvider>
 *     </ClerkProvider>
 *   );
 * }
 * ```
 */

"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useMQTT, ConnectionState, MQTTMessage } from "@/hooks/use-mqtt";

// ============================================================================
// Message Types (based on your application's message schema)
// ============================================================================

/**
 * Job progress update message
 */
export interface JobProgressMessage {
  job_id: string;
  current: number;
  total: number;
  percentage: number;
}

/**
 * Job status change message
 */
export interface JobStatusMessage {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "paused";
  file_url?: string;
  error?: string;
  total_count?: number;
}

/**
 * Transaction/balance change message
 */
export interface TransactionMessage {
  type:
    | "extraction"
    | "refund"
    | "purchase"
    | "subscription"
    | "referral_bonus"
    | "admin_adjustment";
  amount: number;
  new_balance: number;
  description: string;
  reference_id?: string;
  timestamp: string;
}

/**
 * User notification message
 */
export interface NotificationMessage {
  type:
    | "job_completed"
    | "job_failed"
    | "refund"
    | "purchase"
    | "announcement"
    | "info"
    | "warning"
    | "error";
  title: string;
  message: string;
  action_url?: string;
  job_id?: string;
}

// ============================================================================
// Context Types
// ============================================================================

type MessageHandler<T> = (message: T) => void;
type Unsubscribe = () => void;

interface JobSubscriptionHandlers {
  onProgress?: (message: JobProgressMessage) => void;
  onStatus?: (message: JobStatusMessage) => void;
}

interface MQTTContextValue {
  /** Whether the client is connected to the broker */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Detailed connection state */
  connectionState: ConnectionState;
  /** Current reconnection attempt number (0 if not reconnecting) */
  reconnectAttempt: number;
  /** Last error that occurred */
  error: Error | null;
  /** All messages received (most recent first) */
  messages: MQTTMessage[];

  /** Subscribe to a topic */
  subscribe: (topic: string, qos?: 0 | 1 | 2) => Promise<void>;
  /** Unsubscribe from a topic */
  unsubscribe: (topic: string) => Promise<void>;
  /** Publish a message to a topic */
  publish: (
    topic: string,
    message: unknown,
    options?: { qos?: 0 | 1 | 2; retain?: boolean }
  ) => void;
  /** Force reconnect with fresh token */
  reconnect: () => Promise<void>;
  /** Disconnect from the broker */
  disconnect: () => void;

  // ============================================================================
  // Application-Specific Helpers
  // ============================================================================

  /**
   * Subscribe to notification messages for the current user
   * @returns Unsubscribe function
   */
  onNotification: (handler: MessageHandler<NotificationMessage>) => Unsubscribe;

  /**
   * Subscribe to transaction/balance messages for the current user
   * @returns Unsubscribe function
   */
  onTransaction: (handler: MessageHandler<TransactionMessage>) => Unsubscribe;

  /**
   * Subscribe to a specific job's progress and status updates
   * @param jobId - The job ID to track
   * @param handlers - Callbacks for progress and status updates
   * @returns Unsubscribe function
   */
  subscribeToJob: (
    jobId: string,
    handlers: JobSubscriptionHandlers
  ) => Unsubscribe;
}

// ============================================================================
// Context
// ============================================================================

const MQTTContext = createContext<MQTTContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface MQTTProviderProps {
  children: ReactNode;
  /** Enable debug logging */
  debug?: boolean;
  /** Topic prefix for your application (e.g., "myapp" -> "myapp/{userId}/...") */
  topicPrefix?: string;
  /** Auto-subscribe to user topics on connect */
  autoSubscribeUserTopics?: boolean;
}

/**
 * MQTT Provider Component
 *
 * Wrap your application with this provider to enable MQTT throughout.
 * Should be placed inside ClerkProvider.
 *
 * @example
 * ```tsx
 * // app/providers.tsx
 * export function Providers({ children }) {
 *   return (
 *     <ClerkProvider>
 *       <MQTTProvider
 *         debug={process.env.NODE_ENV === "development"}
 *         topicPrefix="myapp"
 *       >
 *         {children}
 *       </MQTTProvider>
 *     </ClerkProvider>
 *   );
 * }
 * ```
 */
export function MQTTProvider({
  children,
  debug = false,
  topicPrefix = "app",
  autoSubscribeUserTopics = true,
}: MQTTProviderProps) {
  const { user, isLoaded } = useUser();
  const userId = user?.id;

  // Message handlers registry
  const notificationHandlers = useRef<Set<MessageHandler<NotificationMessage>>>(
    new Set()
  );
  const transactionHandlers = useRef<Set<MessageHandler<TransactionMessage>>>(
    new Set()
  );
  const jobProgressHandlers = useRef<
    Map<string, Set<MessageHandler<JobProgressMessage>>>
  >(new Map());
  const jobStatusHandlers = useRef<
    Map<string, Set<MessageHandler<JobStatusMessage>>>
  >(new Map());

  // Base MQTT hook
  const mqtt = useMQTT({ debug });

  // Build user-specific topics
  const getUserTopic = useCallback(
    (suffix: string) => {
      if (!userId) return null;
      return `${topicPrefix}/${userId}/${suffix}`;
    },
    [topicPrefix, userId]
  );

  // Auto-subscribe to user topics when connected
  useEffect(() => {
    if (!mqtt.isConnected || !userId || !autoSubscribeUserTopics) return;

    const topics = [
      getUserTopic("notifications"),
      getUserTopic("transactions"),
    ].filter(Boolean) as string[];

    const subscribeToTopics = async () => {
      for (const topic of topics) {
        try {
          await mqtt.subscribe(topic);
          if (debug) {
            console.log("[MQTT Context] Subscribed to user topic:", topic);
          }
        } catch (err) {
          if (debug) {
            console.error("[MQTT Context] Failed to subscribe to:", topic, err);
          }
        }
      }
    };

    subscribeToTopics();
  }, [
    mqtt.isConnected,
    userId,
    autoSubscribeUserTopics,
    getUserTopic,
    mqtt.subscribe,
    debug,
  ]);

  // Route incoming messages to appropriate handlers
  useEffect(() => {
    if (mqtt.messages.length === 0) return;

    const latestMessage = mqtt.messages[0];
    const { topic, payload } = latestMessage;

    // Notification messages
    const notificationTopic = getUserTopic("notifications");
    if (notificationTopic && topic === notificationTopic) {
      notificationHandlers.current.forEach((handler) => {
        handler(payload as NotificationMessage);
      });
      return;
    }

    // Transaction messages
    const transactionTopic = getUserTopic("transactions");
    if (transactionTopic && topic === transactionTopic) {
      transactionHandlers.current.forEach((handler) => {
        handler(payload as TransactionMessage);
      });
      return;
    }

    // Job progress messages (pattern: {prefix}/{userId}/jobs/{jobId}/progress)
    const jobProgressMatch = topic.match(
      new RegExp(`^${topicPrefix}/[^/]+/jobs/([^/]+)/progress$`)
    );
    if (jobProgressMatch) {
      const jobId = jobProgressMatch[1];
      const handlers = jobProgressHandlers.current.get(jobId);
      if (handlers) {
        handlers.forEach((handler) => {
          handler(payload as JobProgressMessage);
        });
      }
      return;
    }

    // Job status messages (pattern: {prefix}/{userId}/jobs/{jobId}/status)
    const jobStatusMatch = topic.match(
      new RegExp(`^${topicPrefix}/[^/]+/jobs/([^/]+)/status$`)
    );
    if (jobStatusMatch) {
      const jobId = jobStatusMatch[1];
      const handlers = jobStatusHandlers.current.get(jobId);
      if (handlers) {
        handlers.forEach((handler) => {
          handler(payload as JobStatusMessage);
        });
      }
      return;
    }
  }, [mqtt.messages, getUserTopic, topicPrefix]);

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Subscribe to notification messages
   */
  const onNotification = useCallback(
    (handler: MessageHandler<NotificationMessage>): Unsubscribe => {
      notificationHandlers.current.add(handler);
      return () => {
        notificationHandlers.current.delete(handler);
      };
    },
    []
  );

  /**
   * Subscribe to transaction messages
   */
  const onTransaction = useCallback(
    (handler: MessageHandler<TransactionMessage>): Unsubscribe => {
      transactionHandlers.current.add(handler);
      return () => {
        transactionHandlers.current.delete(handler);
      };
    },
    []
  );

  /**
   * Subscribe to job progress and status updates
   */
  const subscribeToJob = useCallback(
    (jobId: string, handlers: JobSubscriptionHandlers): Unsubscribe => {
      if (!userId || !mqtt.isConnected) {
        if (debug) {
          console.warn(
            "[MQTT Context] Cannot subscribe to job: not connected or no user"
          );
        }
        return () => {};
      }

      const progressTopic = `${topicPrefix}/${userId}/jobs/${jobId}/progress`;
      const statusTopic = `${topicPrefix}/${userId}/jobs/${jobId}/status`;

      // Register handlers
      if (handlers.onProgress) {
        if (!jobProgressHandlers.current.has(jobId)) {
          jobProgressHandlers.current.set(jobId, new Set());
        }
        jobProgressHandlers.current.get(jobId)!.add(handlers.onProgress);
      }

      if (handlers.onStatus) {
        if (!jobStatusHandlers.current.has(jobId)) {
          jobStatusHandlers.current.set(jobId, new Set());
        }
        jobStatusHandlers.current.get(jobId)!.add(handlers.onStatus);
      }

      // Subscribe to MQTT topics
      const subscribePromises: Promise<void>[] = [];
      if (handlers.onProgress) {
        subscribePromises.push(
          mqtt.subscribe(progressTopic).catch((err) => {
            if (debug) {
              console.error(
                "[MQTT Context] Failed to subscribe to progress:",
                err
              );
            }
          })
        );
      }
      if (handlers.onStatus) {
        subscribePromises.push(
          mqtt.subscribe(statusTopic).catch((err) => {
            if (debug) {
              console.error(
                "[MQTT Context] Failed to subscribe to status:",
                err
              );
            }
          })
        );
      }

      // Return cleanup function
      return () => {
        // Remove handlers
        if (handlers.onProgress) {
          const progressSet = jobProgressHandlers.current.get(jobId);
          if (progressSet) {
            progressSet.delete(handlers.onProgress);
            if (progressSet.size === 0) {
              jobProgressHandlers.current.delete(jobId);
              // Unsubscribe from MQTT topic if no more handlers
              mqtt.unsubscribe(progressTopic).catch(() => {});
            }
          }
        }

        if (handlers.onStatus) {
          const statusSet = jobStatusHandlers.current.get(jobId);
          if (statusSet) {
            statusSet.delete(handlers.onStatus);
            if (statusSet.size === 0) {
              jobStatusHandlers.current.delete(jobId);
              mqtt.unsubscribe(statusTopic).catch(() => {});
            }
          }
        }
      };
    },
    [userId, mqtt.isConnected, mqtt.subscribe, mqtt.unsubscribe, topicPrefix, debug]
  );

  const contextValue: MQTTContextValue = {
    // Base MQTT state
    isConnected: mqtt.isConnected,
    isConnecting: mqtt.isConnecting,
    connectionState: mqtt.connectionState,
    reconnectAttempt: mqtt.reconnectAttempt,
    error: mqtt.error,
    messages: mqtt.messages,

    // Base MQTT methods
    subscribe: mqtt.subscribe,
    unsubscribe: mqtt.unsubscribe,
    publish: mqtt.publish,
    reconnect: mqtt.reconnect,
    disconnect: mqtt.disconnect,

    // Application helpers
    onNotification,
    onTransaction,
    subscribeToJob,
  };

  return (
    <MQTTContext.Provider value={contextValue}>{children}</MQTTContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access MQTT context
 *
 * Must be used within an MQTTProvider (which must be inside ClerkProvider).
 *
 * @example
 * ```tsx
 * function NotificationBell() {
 *   const { isConnected, onNotification } = useMQTTContext();
 *   const [count, setCount] = useState(0);
 *
 *   useEffect(() => {
 *     const unsubscribe = onNotification((msg) => {
 *       setCount(c => c + 1);
 *       toast(msg.title, msg.message);
 *     });
 *     return unsubscribe;
 *   }, [onNotification]);
 *
 *   return <span>{count} notifications</span>;
 * }
 * ```
 */
export function useMQTTContext(): MQTTContextValue {
  const context = useContext(MQTTContext);
  if (!context) {
    throw new Error("useMQTTContext must be used within an MQTTProvider");
  }
  return context;
}

// Alias for convenience
export { useMQTTContext as useMQTT };

export default MQTTProvider;
