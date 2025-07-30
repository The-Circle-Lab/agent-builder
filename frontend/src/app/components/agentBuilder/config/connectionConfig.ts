import { Edge } from "@xyflow/react";
import { HandleConfig } from "../components/nodes/nodeTypes/baseNode";

export interface HandleConfigInterface {
  maxConnections: number; // -1 for unlimited
  compatibleWith: string[]; // Array of handle IDs this handle can connect to
}

export interface ConnectionConfig {
  [handleId: string]: HandleConfigInterface;
}

// Type for node class with static methods
type NodeClassWithStatics = {
  getHandleConfigs?: () => Record<string, HandleConfig>;
};

// Cache for the connection config
let connectionConfigCache: ConnectionConfig | null = null;
let nodeClassesCallback: (() => Record<string, unknown>) | null = null;

// Register NodeClasses callback from the node types index
export function registerNodeClasses(getNodeClasses: () => Record<string, unknown>) {
  nodeClassesCallback = getNodeClasses;
  // Clear cache when NodeClasses are registered
  connectionConfigCache = null;
}

// Function to clear the cache and force reload
export function clearConnectionConfigCache() {
  connectionConfigCache = null;
}

// Debug function to inspect connection config
export function debugConnectionConfig() {
  const config = getConnectionConfig();
  console.log('Full connection config:', config);
  return config;
}

// Make debug functions available globally for browser console access
if (typeof window !== 'undefined') {
  const globalWindow = window as unknown as Record<string, unknown>;
  globalWindow.debugConnectionConfig = debugConnectionConfig;
  globalWindow.clearConnectionConfigCache = clearConnectionConfigCache;
}

// Dynamically build connection config from node class definitions
function buildConnectionConfig(): ConnectionConfig {
  // Use cache if available
  if (connectionConfigCache) {
    return connectionConfigCache;
  }
  
  const config: ConnectionConfig = {};
  
  // Use the registered NodeClasses callback
  if (!nodeClassesCallback) {
    console.warn("NodeClasses not yet registered, returning empty config");
    return config;
  }
  
  try {
    const NodeClasses = nodeClassesCallback();
    
    // Iterate through all node classes and collect their handle configurations
    Object.values(NodeClasses).forEach((NodeClass) => {
      const NodeClassTyped = NodeClass as unknown as NodeClassWithStatics;
      if (NodeClassTyped && typeof NodeClassTyped.getHandleConfigs === 'function') {
        const handleConfigs = NodeClassTyped.getHandleConfigs();
        Object.entries(handleConfigs).forEach(([handleId, handleConfig]) => {
          if (config[handleId]) {
            // Merge with existing configuration
            const existing = config[handleId];
            const mergedCompatible = Array.from(
              new Set([...existing.compatibleWith, ...handleConfig.compatibleWith])
            );
            config[handleId] = {
              maxConnections:
                existing.maxConnections === -1 || handleConfig.maxConnections === -1
                  ? -1
                  : Math.max(existing.maxConnections, handleConfig.maxConnections),
              compatibleWith: mergedCompatible,
            };
          } else {
            config[handleId] = {
              maxConnections: handleConfig.maxConnections,
              compatibleWith: handleConfig.compatibleWith,
            };
          }
        });
      }
    });
  } catch (error) {
    console.warn("Failed to load NodeClasses for connection config:", error);
  }
  
  // Cache the result
  connectionConfigCache = config;
  return config;
}

// Get the connection config (builds it if not cached)
export function getConnectionConfig(): ConnectionConfig {
  return buildConnectionConfig();
}

// Legacy export for backwards compatibility - now lazy-loaded
export const connectionConfig = new Proxy({} as ConnectionConfig, {
  get(target, prop) {
    const config = getConnectionConfig();
    return config[prop as string];
  },
  ownKeys() {
    const config = getConnectionConfig();
    return Object.keys(config);
  },
  has(target, prop) {
    const config = getConnectionConfig();
    return prop in config;
  }
});

// Helper function to extract handle type from handle ID
function getHandleType(handleId: string): string {
  // First check if it's a dynamic variable handle
  if (handleId.includes('-input')) {
    return 'variable-input';
  }
  if (handleId.includes('-output')) {
    return 'variable-output';
  }
  
  // For other handle types, return the handle ID as-is
  return handleId;
}

export function canConnect(
  sourceHandle: string,
  targetHandle: string,
  currentEdges: Edge[],
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const config = getConnectionConfig();
  
  // Get handle types (for dynamic handles like variable handles)
  const sourceType = getHandleType(sourceHandle);
  const targetType = getHandleType(targetHandle);
  
  // Try exact handle IDs first, then fall back to handle types
  const sourceConfig = config[sourceHandle] || config[sourceType];
  const targetConfig = config[targetHandle] || config[targetType];
  
  // Check if handles exist in config
  if (!sourceConfig || !targetConfig) {
    console.warn(
      `Handle configuration missing for ${sourceHandle} (type: ${sourceType}) or ${targetHandle} (type: ${targetType})`
    );
    return false;
  }

  // Check compatibility using both exact IDs and types
  const isCompatible = 
    sourceConfig.compatibleWith.includes(targetHandle) ||
    sourceConfig.compatibleWith.includes(targetType);
    
  if (!isCompatible) {
    return false;
  }

  // Check source handle connection limits
  if (sourceConfig.maxConnections !== -1) {
    const sourceConnections = currentEdges.filter(
      (edge) =>
        edge.source === sourceNodeId && edge.sourceHandle === sourceHandle
    ).length;

    if (sourceConnections >= sourceConfig.maxConnections) {
      return false;
    }
  }

  // Check target handle connection limits
  if (targetConfig.maxConnections !== -1) {
    const targetConnections = currentEdges.filter(
      (edge) =>
        edge.target === targetNodeId && edge.targetHandle === targetHandle
    ).length;

    if (targetConnections >= targetConfig.maxConnections) {
      return false;
    }
  }

  return true;
}
