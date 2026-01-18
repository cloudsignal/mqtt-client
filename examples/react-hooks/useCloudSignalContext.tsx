/**
 * CloudSignal React Context
 * 
 * Provides CloudSignal MQTT state and methods to all components via React Context.
 * 
 * @example
 * ```tsx
 * // App.tsx
 * import { CloudSignalProvider } from "./useCloudSignalContext";
 * 
 * function App() {
 *   return (
 *     <CloudSignalProvider 
 *       tokenServiceUrl="https://auth.cloudsignal.app"
 *       debug={process.env.NODE_ENV === "development"}
 *     >
 *       <MyApp />
 *     </CloudSignalProvider>
 *   );
 * }
 * 
 * // ChildComponent.tsx
 * import { useCloudSignalContext } from "./useCloudSignalContext";
 * 
 * function ChildComponent() {
 *   const { isConnected, publish } = useCloudSignalContext();
 *   return <button onClick={() => publish("topic", "message")}>Send</button>;
 * }
 * ```
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useCloudSignal, UseCloudSignalReturn, UseCloudSignalOptions } from "./useCloudSignal";

// ============================================================================
// Context
// ============================================================================

const CloudSignalContext = createContext<UseCloudSignalReturn | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface CloudSignalProviderProps extends UseCloudSignalOptions {
  children: ReactNode;
}

/**
 * CloudSignal Context Provider
 * 
 * Wrap your app with this to provide MQTT connectivity to all components.
 */
export function CloudSignalProvider({
  children,
  debug,
  tokenServiceUrl,
  preset,
  maxMessages,
}: CloudSignalProviderProps) {
  const cloudSignal = useCloudSignal({
    debug,
    tokenServiceUrl,
    preset,
    maxMessages,
  });

  return (
    <CloudSignalContext.Provider value={cloudSignal}>
      {children}
    </CloudSignalContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access CloudSignal context
 * 
 * Must be used within a CloudSignalProvider.
 * 
 * @throws Error if used outside of CloudSignalProvider
 */
export function useCloudSignalContext(): UseCloudSignalReturn {
  const context = useContext(CloudSignalContext);
  if (!context) {
    throw new Error(
      "useCloudSignalContext must be used within a CloudSignalProvider"
    );
  }
  return context;
}

export default CloudSignalProvider;
