import { Edge, NodeProps } from "@xyflow/react";
import { NodeData, NodePropertyConfig } from "./types";
import {
  NodeClasses,
  NodeConfigs,
  NodeCreators,
  AVAILABLE_NODE_TYPES,
  type AvailableNodeType,
} from "./nodeTypes";

export interface NodeTypeHandlers {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  onDelete?: (nodeId: string) => void;
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void;
  workflowId?: string | number;
  pageRelationships?: Record<string, string[]>;
  nodes?: { id: string; type: string }[];
}

// Helper function to get node configuration by type
export function getNodeConfig(
  nodeType: string
): NodePropertyConfig | undefined {
  return NodeConfigs[nodeType as keyof typeof NodeConfigs] as unknown as NodePropertyConfig | undefined;
}

// Registry mapping node type keys to their factory functions
const NODE_FACTORY_MAP: Record<
  AvailableNodeType,
  (handlers: NodeTypeHandlers) => React.ComponentType<NodeProps>
> = AVAILABLE_NODE_TYPES.reduce((map, nodeType) => {
  map[nodeType] = (handlers) => {
    if (nodeType === "mcp") {
      // MCP node gets special handling for workflowId
      const creator = NodeCreators[nodeType] as (
        onDelete?: (nodeId: string) => void,
        onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void,
        workflowId?: string | number
      ) => React.ComponentType<NodeProps>;
      return creator(handlers.onDelete, handlers.onSettings, handlers.workflowId) as React.ComponentType<NodeProps>;
    } else if (nodeType === "page") {
      // Page node gets special handling for pageRelationships and nodes
      const creator = NodeCreators[nodeType] as (
        onAddNodeClick?: (objectType?: string, sourceNodeId?: string, pageId?: string) => void,
        edges?: unknown[],
        onDelete?: (nodeId: string) => void,
        onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void,
        pageRelationships?: Record<string, string[]>,
        allNodes?: { id: string; type: string }[]
      ) => React.ComponentType<NodeProps>;
      return creator(
        handlers.onAddNodeClick,
        handlers.edges || [],
        handlers.onDelete,
        handlers.onSettings,
        handlers.pageRelationships,
        handlers.nodes
      ) as React.ComponentType<NodeProps>;
    } else if (NodeClasses[nodeType as keyof typeof NodeClasses].canAddNode) {
      // Nodes that can add nodes get special handler mapping
      return (
        NodeCreators[
          nodeType as keyof typeof NodeCreators
        ] as typeof NodeCreators.agent
      )(
        handlers.onAddNodeClick,
        handlers.edges || [],
        handlers.onDelete,
        handlers.onSettings
      ) as React.ComponentType<NodeProps>;
    } else {
      // All other nodes get default handler mapping
      const creator = NodeCreators[nodeType as keyof typeof NodeCreators] as (
        onDelete?: (nodeId: string) => void,
        onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
      ) => React.ComponentType<NodeProps>;
      return creator(handlers.onDelete, handlers.onSettings) as React.ComponentType<NodeProps>;
    }
  };
  return map;
}, {} as Record<AvailableNodeType, (handlers: NodeTypeHandlers) => React.ComponentType<NodeProps>>);

// Dynamic factory that creates all node types from registry
export const createAllNodeTypes = (
  handlers: NodeTypeHandlers
): Record<string, React.ComponentType<NodeProps>> => {
  const nodeTypes: Record<string, React.ComponentType<NodeProps>> = {};

  AVAILABLE_NODE_TYPES.forEach((nodeType) => {
    const factory = NODE_FACTORY_MAP[nodeType];
    if (factory) {
      nodeTypes[nodeType] = factory(handlers);
    }
  });

  return nodeTypes;
};

// Export the list of available node types for reference
export { AVAILABLE_NODE_TYPES } from "./nodeTypes/index";
