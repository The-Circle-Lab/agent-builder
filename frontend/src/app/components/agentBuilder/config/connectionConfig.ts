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
          config[handleId] = {
            maxConnections: handleConfig.maxConnections,
            compatibleWith: handleConfig.compatibleWith,
          };
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

export function canConnect(
  sourceHandle: string,
  targetHandle: string,
  currentEdges: Edge[],
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const config = getConnectionConfig();
  const sourceConfig = config[sourceHandle];
  const targetConfig = config[targetHandle];
  
  // Check if handles exist in config
  if (!sourceConfig || !targetConfig) {
    console.warn(
      `Handle configuration missing for ${sourceHandle} or ${targetHandle}`
    );
    return false;
  }

  // Check compatibility
  if (!sourceConfig.compatibleWith.includes(targetHandle)) {
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
