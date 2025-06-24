import { Node, Edge } from "@xyflow/react";
import { NodeClasses, NodeConfigs } from "../components/nodes/nodeTypes";

// Finds the 'starting' node
export function findStartingNode(nodes: Node[]): Node | null {
  for (const node of nodes) {
    const nodeClass = NodeClasses[node.type as keyof typeof NodeClasses];

    if (nodeClass && nodeClass.nodeType === "start") {
      return node;
    }
  }

  return null;
}

// Helper function to get connected nodes for a specific handle
export function getConnectedNodes(
  sourceNodeId: string,
  handleId: string,
  edges: Edge[],
  nodes: Node[]
): Node[] {
  const connectedEdges = edges.filter(
    (edge) => edge.source === sourceNodeId && edge.sourceHandle === handleId
  );

  return connectedEdges
    .map((edge) => {
      const targetNode = nodes.find((node) => node.id === edge.target);
      return targetNode;
    })
    .filter((node) => node !== undefined) as Node[];
}

// Helper function to get node configuration with data
export function getNodeConfig(node: Node) {
  const nodeConfig = NodeConfigs[node.type as keyof typeof NodeConfigs];
  if (!nodeConfig) return {};

  // Merge the node's data with default values from config
  const config: Record<string, unknown> = {};

  // Add all properties from the node config with their values
  nodeConfig.properties.forEach((property) => {
    const value =
      node.data?.[property.key] !== undefined
        ? node.data[property.key]
        : property.defaultValue;
    config[property.key] = value;
  });

  return config;
}

// Helper function to get attachments for specific node types
export function getNodeAttachments(
  node: Node,
  edges: Edge[],
  nodes: Node[]
): Record<string, unknown> | undefined {
  if (node.type === "agent") {
    const attachments: Record<string, unknown> = {};

    // Get LLM model attachments
    const llmNodes = getConnectedNodes(node.id, "llm-model", edges, nodes);
    if (llmNodes.length > 0) {
      attachments.llmModel = llmNodes.map((llmNode) => ({
        type: llmNode.type,
        config: getNodeConfig(llmNode),
      }));
    }

    // Get tools attachments
    const toolNodes = getConnectedNodes(node.id, "tools", edges, nodes);
    if (toolNodes.length > 0) {
      attachments.tools = toolNodes.map((toolNode) => ({
        type: toolNode.type,
        config: getNodeConfig(toolNode),
      }));
    }

    return Object.keys(attachments).length > 0 ? attachments : undefined;
  }

  return undefined;
}
