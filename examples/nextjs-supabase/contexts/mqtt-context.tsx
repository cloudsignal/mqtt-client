/**
 * CloudSignal MQTT Context
 * 
 * Provides MQTT connection state and methods to all components via React Context.
 * Wrap your app with <MQTTProvider> to use the useMQTTContext hook.
 */

"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useMQTT } from "@/hooks/use-mqtt";

// Re-export the message type for consumers
export interface MQTTMessage {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

interface MQTTContextValue {
  /** Whether the client is connected to the broker */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Current reconnection attempt number (0 if not reconnecting) */
  reconnectAttempt: number;
  /** Last error that occurred */
  error: Error | null;
  /** Messages received (most recent first, max 100) */
  messages: MQTTMessage[];
  /** Subscribe to a topic */
  subscribe: (topic: string, qos?: 0 | 1 | 2) => Promise<void>;
  /** Unsubscribe from a topic */
  unsubscribe: (topic: string) => Promise<void>;
  /** Publish a message to a topic */
  publish: (topic: string, message: unknown, options?: { qos?: 0 | 1 | 2; retain?: boolean }) => void;
  /** Manually trigger a connection (usually not needed) */
  connect: () => Promise<void>;
  /** Disconnect from the broker */
  disconnect: () => void;
}

const MQTTContext = createContext<MQTTContextValue | null>(null);

interface MQTTProviderProps {
  children: ReactNode;
  /** Enable debug logging */
  debug?: boolean;
  /** Topics to auto-subscribe on connect */
  initialTopics?: string[];
}

/**
 * MQTT Provider Component
 * 
 * Wrap your application with this provider to enable MQTT throughout.
 * 
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { MQTTProvider } from "@/contexts/mqtt-context";
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <MQTTProvider debug={process.env.NODE_ENV === "development"}>
 *           {children}
 *         </MQTTProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function MQTTProvider({ children, debug = false, initialTopics = [] }: MQTTProviderProps) {
  const mqtt = useMQTT({ debug, initialTopics });

  return <MQTTContext.Provider value={mqtt}>{children}</MQTTContext.Provider>;
}

/**
 * Hook to access MQTT context
 * 
 * Must be used within an MQTTProvider.
 * 
 * @example
 * ```tsx
 * function ChatRoom() {
 *   const { isConnected, subscribe, publish, messages } = useMQTTContext();
 *   
 *   useEffect(() => {
 *     if (isConnected) {
 *       subscribe("chat/general");
 *     }
 *   }, [isConnected]);
 *   
 *   return (
 *     <div>
 *       {messages
 *         .filter(m => m.topic === "chat/general")
 *         .map((m, i) => <Message key={i} data={m.payload} />)}
 *     </div>
 *   );
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
