import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";

// Define connection mappings for automatic connections
const CONNECTION_MAPPINGS: Record<
  string,
  { sourceHandle: string; targetHandle: string }
> = {
  LLM: { sourceHandle: "llm-model", targetHandle: "llm-input" },
  tools: { sourceHandle: "tools", targetHandle: "input" },
  Agent: { sourceHandle: "chat-output", targetHandle: "agent-input" },
  Output: { sourceHandle: "output", targetHandle: "result-input" },
};

// Define handle positions for different node types and handles
const HANDLE_POSITIONS: Record<
  string,
  Record<string, { x: number; y: number }>
> = {
  agent: {
    "llm-model": { x: 0.25, y: 1 }, // 25% from left, bottom of node
    tools: { x: 0.75, y: 1 }, // 75% from left, bottom of node
    output: { x: 1, y: 0.5 }, // Right side, middle
  },
};

// Standard node dimensions (approximate, including padding)
const NODE_DIMENSIONS = {
  agent: { width: 192, height: 120 }, // w-48 = 192px, includes image + text + padding
  googleCloud: { width: 100, height: 80 }, // Smaller compact node
  openAI: { width: 100, height: 80 }, // Similar to googleCloud
  tool: { width: 120, height: 80 }, // Default tool size
  database: { width: 120, height: 80 }, // Default database size
};

function calculateNewNodePosition(
  sourceNode: Node,
  sourceHandle: string,
  spacing: number = 150
): { x: number; y: number } {
  const nodeType = sourceNode.type || "agent";
  const handlePositions = HANDLE_POSITIONS[nodeType];
  const nodeDimensions =
    NODE_DIMENSIONS[nodeType as keyof typeof NODE_DIMENSIONS] ||
    NODE_DIMENSIONS.agent;

  if (!handlePositions || !handlePositions[sourceHandle]) {
    // Fallback to node center + spacing
    return {
      x: Math.floor(sourceNode.position.x / 15) * 15,
      y: Math.floor((sourceNode.position.y + spacing) / 15) * 15,
    };
  }

  const handlePos = handlePositions[sourceHandle];

  // Calculate absolute handle position
  const handleAbsoluteX =
    sourceNode.position.x + handlePos.x * nodeDimensions.width;
  const handleAbsoluteY =
    sourceNode.position.y + handlePos.y * nodeDimensions.height;

  // Position new node below the handle
  return {
    x: handleAbsoluteX - nodeDimensions.width / 2, // Center the new node on the handle
    y: handleAbsoluteY + spacing,
  };
}

export function useNodeOperations(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  sourceNodeId: string | undefined,
  sideMenuObjectType: string | undefined,
  nodes: Node[] // Add nodes array to find source node
) {
  const handleAddNode = useCallback(
    (nodeType: string) => {
      // Calculate position based on source node and handle
      let position = { x: Math.random() * 400, y: Math.random() * 400 }; // fallback

      if (
        sourceNodeId &&
        sideMenuObjectType &&
        CONNECTION_MAPPINGS[sideMenuObjectType]
      ) {
        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        if (sourceNode) {
          const { sourceHandle } = CONNECTION_MAPPINGS[sideMenuObjectType];
          position = calculateNewNodePosition(sourceNode, sourceHandle);
        }
      }

      const newNode: Node = {
        id: `node-${Date.now()}`,
        position,
        data: { label: `New ${nodeType}` },
        type: nodeType,
      };

      setNodes((nds: Node[]) => [...nds, newNode]);

      // Create automatic connection if source node and object type are available
      if (
        sourceNodeId &&
        sideMenuObjectType &&
        CONNECTION_MAPPINGS[sideMenuObjectType]
      ) {
        const { sourceHandle, targetHandle } =
          CONNECTION_MAPPINGS[sideMenuObjectType];
        const newEdge: Edge = {
          id: `edge-${sourceNodeId}-${newNode.id}`,
          source: sourceNodeId,
          target: newNode.id,
          sourceHandle,
          targetHandle,
        };
        setEdges((eds: Edge[]) => [...eds, newEdge]);
      }
    },
    [setNodes, setEdges, sourceNodeId, sideMenuObjectType, nodes]
  );

  return {
    handleAddNode,
  };
}
