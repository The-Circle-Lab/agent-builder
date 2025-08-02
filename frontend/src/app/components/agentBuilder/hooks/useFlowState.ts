import { useCallback, useState, useRef } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeChange,
} from "@xyflow/react";
import { canConnect } from "../config/connectionConfig";

// Type for tracking which nodes belong to which pages
export interface PageNodeRelationship {
  pageId: string;
  nodeIds: string[];
}

// Type for page relationships map
export interface PageRelationshipsMap {
  [pageId: string]: string[]; // pageId -> array of nodeIds
}

export function useFlowState(
  initialNodes: Node[], 
  initialEdges: Edge[], 
  initialPageRelationships?: PageRelationshipsMap
) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // Track page-node relationships - initialize with provided data
  const [pageRelationships, setPageRelationships] = useState<PageRelationshipsMap>(
    initialPageRelationships || {}
  );
  
  // Track previous page positions to detect movement
  const previousPagePositions = useRef<Record<string, { x: number; y: number }>>({});

    // Helper function to find which page a node belongs to
  const findNodePage = useCallback(
    (nodeId: string): Node | null => {
      for (const [pageId, childIds] of Object.entries(pageRelationships)) {
        if (childIds.includes(nodeId)) {
          return nodes.find((n) => n.id === pageId && n.type === "page") || null;
        }
      }
      return null;
    },
    [nodes, pageRelationships]
  );

  // Helper function to constrain node position within page bounds
  const constrainNodeToPage = useCallback(
    (nodePosition: { x: number; y: number }, pageNode: Node): { x: number; y: number } => {
      const pageWidth = pageNode.width || pageNode.data?.width || 300;
      const pageHeight = pageNode.height || pageNode.data?.height || 200;
      const margin = 10; // Small margin from page edges
      const headerHeight = 40; // Account for page header
      const nodeSize = 100; // Approximate node size

      // Calculate page bounds
      const pageLeft = pageNode.position.x + margin;
      const pageRight = pageNode.position.x + Number(pageWidth) - nodeSize - margin;
      const pageTop = pageNode.position.y + headerHeight + margin;
      const pageBottom = pageNode.position.y + Number(pageHeight) - nodeSize - margin;

      // Constrain position to page bounds
      return {
        x: Math.max(pageLeft, Math.min(pageRight, nodePosition.x)),
        y: Math.max(pageTop, Math.min(pageBottom, nodePosition.y)),
      };
    },
    []
  );

  // Custom onNodesChange handler to move child nodes when page moves and constrain them
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (change): change is NodeChange & { type: "position" } =>
          change.type === "position" && change.position !== undefined
      );

      // Handle page movements (both during drag and after drag)
      positionChanges.forEach((change) => {
        const node = nodes.find((n) => n.id === change.id);
        if (node?.type === "page" && change.position) {
          const prevPosition = previousPagePositions.current[change.id];
          
          // Initialize previous position if it doesn't exist
          if (!prevPosition) {
            previousPagePositions.current[change.id] = { ...change.position };
            return;
          }

          const deltaX = change.position.x - prevPosition.x;
          const deltaY = change.position.y - prevPosition.y;
          
          // Move all child nodes by the same delta (during both drag and after drag)
          const childNodeIds = pageRelationships[change.id] || [];
          if (childNodeIds.length > 0 && (deltaX !== 0 || deltaY !== 0)) {
            setNodes((nds: Node[]) =>
              nds.map((n: Node) =>
                childNodeIds.includes(n.id)
                  ? {
                      ...n,
                      position: {
                        x: n.position.x + deltaX,
                        y: n.position.y + deltaY,
                      },
                    }
                  : n
              )
            );
          }
          
          // Update previous position for next delta calculation
          previousPagePositions.current[change.id] = { ...change.position };
        }
      });

      // Constrain child nodes to their page bounds
      const constrainedChanges = changes.map((change) => {
        if (change.type === "position" && change.position) {
          const pageNode = findNodePage(change.id);
          if (pageNode) {
            // Constrain the position to page bounds
            const constrainedPosition = constrainNodeToPage(change.position, pageNode);
            return {
              ...change,
              position: constrainedPosition,
            };
          }
        }
        return change;
      });

      // Apply all changes (with constraints)
      onNodesChangeBase(constrainedChanges);
    },
    [nodes, pageRelationships, setNodes, onNodesChangeBase, findNodePage, constrainNodeToPage]
  );

  // Add node to page relationship
  const addNodeToPage = useCallback(
    (nodeId: string, pageId: string) => {
      setPageRelationships((prev) => ({
        ...prev,
        [pageId]: [...(prev[pageId] || []), nodeId],
      }));
    },
    []
  );

  // Remove node from page relationship
  const removeNodeFromPage = useCallback(
    (nodeId: string, pageId?: string) => {
      setPageRelationships((prev) => {
        const newRelationships = { ...prev };
        if (pageId && newRelationships[pageId]) {
          newRelationships[pageId] = newRelationships[pageId].filter(
            (id) => id !== nodeId
          );
          if (newRelationships[pageId].length === 0) {
            delete newRelationships[pageId];
          }
        } else {
          // Remove from all pages if pageId not specified
          Object.keys(newRelationships).forEach((pid) => {
            newRelationships[pid] = newRelationships[pid].filter(
              (id) => id !== nodeId
            );
            if (newRelationships[pid].length === 0) {
              delete newRelationships[pid];
            }
          });
        }
        return newRelationships;
      });
    },
    []
  );

  // Get nodes in a page
  const getNodesInPage = useCallback(
    (pageId: string): string[] => {
      return pageRelationships[pageId] || [];
    },
    [pageRelationships]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // If deleting a page, also delete all nodes in that page
      const nodeToDelete = nodes.find((node) => node.id === nodeId);
      if (nodeToDelete?.type === "page") {
        const nodesInPage = pageRelationships[nodeId] || [];
        // Delete all nodes in the page
        setNodes((nds: Node[]) =>
          nds.filter(
            (node: Node) =>
              node.id !== nodeId && !nodesInPage.includes(node.id)
          )
        );
        // Delete all edges connected to those nodes
        setEdges((eds: Edge[]) =>
          eds.filter(
            (edge: Edge) =>
              edge.source !== nodeId &&
              edge.target !== nodeId &&
              !nodesInPage.includes(edge.source) &&
              !nodesInPage.includes(edge.target)
          )
        );
        // Remove page relationship
        setPageRelationships((prev) => {
          const newRelationships = { ...prev };
          delete newRelationships[nodeId];
          return newRelationships;
        });
      } else {
        // Normal node deletion
        setNodes((nds: Node[]) =>
          nds.filter((node: Node) => node.id !== nodeId)
        );
        setEdges((eds: Edge[]) =>
          eds.filter(
            (edge: Edge) => edge.source !== nodeId && edge.target !== nodeId
          )
        );
        // Remove from page relationships
        removeNodeFromPage(nodeId);
      }
    },
    [setNodes, setEdges, nodes, pageRelationships, removeNodeFromPage]
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
    pageRelationships,
    addNodeToPage,
    removeNodeFromPage,
    getNodesInPage,
  };
}
