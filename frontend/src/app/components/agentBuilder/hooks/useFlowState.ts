import { useCallback } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "@xyflow/react";
import { canConnect } from "../config/connectionConfig";

export function useFlowState(initialNodes: Node[], initialEdges: Edge[]) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds: Node[]) => nds.filter((node: Node) => node.id !== nodeId));
      setEdges((eds: Edge[]) =>
        eds.filter(
          (edge: Edge) => edge.source !== nodeId && edge.target !== nodeId
        )
      );
    },
    [setNodes, setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Check if connection is allowed based on configuration
      const isAllowed = canConnect(
        params.sourceHandle || "",
        params.targetHandle || "",
        edges,
        params.source || "",
        params.target || ""
      );

      if (isAllowed) {
        setEdges((eds: Edge[]) => addEdge(params, eds));
      }
    },
    [setEdges, edges]
  );

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    handleDeleteNode,
    onConnect,
  };
}
