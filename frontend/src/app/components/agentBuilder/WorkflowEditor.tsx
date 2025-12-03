"use client";

import React, { useEffect, useCallback, useState } from "react";
import { ReactFlow, Edge, Background, Node, ConnectionMode } from "@xyflow/react";
import { useFlowState } from "./hooks/useFlowState";
import {
  createAllNodeTypes,
  NodeData,
  useNodeOperations,
} from "./components/nodes";
import { Var } from "./components/nodes/types";
import { createVariableIndex } from "./scripts/nodeHelpers";
import { NodeContextProvider, setGlobalNodeContext } from "./components/nodes/nodeContext";
import { SideMenu, useSideMenu } from "./components/sideMenu";
import {
  SettingsMenu,
  useSettingsMenu,
} from "./components/nodes/components/settingsMenu";
import PageSorter from "./components/pageSorter";
import { CopyPagesModal } from "./components/CopyPagesModal";

import { createWorkflowJSON } from "./scripts/exportWorkflow";
import { BaseDeploymentAPI } from "../../../lib/deploymentAPIs/deploymentAPI";
import { NodeClasses } from "./components/nodes/nodeTypes";
import { WorkflowSaveData } from "./scripts/workflowSave";

import "@xyflow/react/dist/style.css";

interface WorkflowEditorProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialPageRelationships?: Record<string, string[]>;
  onWorkflowChange?: (
    nodes: Node[],
    edges: Edge[],
    pageRelationships: Record<string, string[]>
  ) => void;
  autoSave?: boolean;
  autoSaveInterval?: number;
  workflowId?: string | number;
  workflowName?: string;
  onDeploySuccess?: (deploymentId: string, chatUrl: string) => void;
}

export default function WorkflowEditor({
  initialNodes = [],
  initialEdges = [],
  initialPageRelationships = {},
  onWorkflowChange,
  autoSave = false,
  autoSaveInterval = 5000, // 5 seconds
  workflowId,
  workflowName = "Untitled Workflow",
  onDeploySuccess,
}: WorkflowEditorProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  // Custom hooks for state management
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    handleDeleteNode,
    onConnect,
    pageRelationships,
    setPageRelationships,
    addNodeToPage,
  } = useFlowState(initialNodes, initialEdges, initialPageRelationships);

  const {
    isSideMenuOpen,
    sideMenuObjectType,
    sourceNodeId,
    handleOpenSideMenu,
    handleCloseSideMenu,
  } = useSideMenu();

  // State for tracking which page we're adding to
  const [currentPageId, setCurrentPageId] = useState<string | undefined>(
    undefined
  );

  const { handleAddNode } = useNodeOperations(
    setNodes,
    setEdges,
    sourceNodeId,
    sideMenuObjectType,
    nodes,
    addNodeToPage,
    currentPageId,
    pageRelationships
  );

  const {
    isSettingsOpen,
    settingsData,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
  } = useSettingsMenu(workflowId, nodes, edges, pageRelationships);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }
    const timer = setTimeout(() => setCopyFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  interface CopyPagesArgs {
    workflowId: number;
    workflowName: string;
    workflowData: WorkflowSaveData;
    selectedPageIds: string[];
  }

  const handleCopyPages = useCallback(
    ({ workflowName, workflowData, selectedPageIds }: CopyPagesArgs) => {
      if (!workflowData?.nodes?.length) {
        setCopyFeedback({
          type: "error",
          message: "Selected workflow has no nodes to copy.",
        });
        return;
      }

      if (selectedPageIds.length === 0) {
        return;
      }

      const sourceRelationships = workflowData.pageRelationships || {};
      const nodeIdsToCopy = new Set<string>(selectedPageIds);
      const childToPage = new Map<string, string>();

      selectedPageIds.forEach((pageId) => {
        const childIds = sourceRelationships[pageId] || [];
        childIds.forEach((childId) => {
          nodeIdsToCopy.add(childId);
          childToPage.set(childId, pageId);
        });
      });

      const nodesToCopy = workflowData.nodes.filter((node) =>
        nodeIdsToCopy.has(node.id)
      );

      if (nodesToCopy.length === 0) {
        setCopyFeedback({
          type: "error",
          message: "Nothing to copy from the selected workflow.",
        });
        return;
      }

      const existingNodeIds = new Set(nodes.map((node) => node.id));
      const existingEdgeIds = new Set(edges.map((edge) => edge.id));

      const uniqueId = (baseId: string, usedIds: Set<string>, suffix: string) => {
        let candidate = `${baseId}-${suffix}`;
        while (usedIds.has(candidate)) {
          candidate = `${baseId}-${suffix}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
        }
        return candidate;
      };

      const deepCloneData = (data: unknown) =>
        data !== undefined ? JSON.parse(JSON.stringify(data)) : {};

      const idMap = new Map<string, string>();
      const pageOffsets = new Map<string, { dx: number; dy: number }>();
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const newRelationships: Record<string, string[]> = {};

      const currentMaxPageNumber = nodes
        .filter((node) => node.type === "page")
        .reduce(
          (max, node) =>
            Math.max(max, Number(node.data?.pageNumber) || 0),
          0
        );

      let nextPageNumber = currentMaxPageNumber;

      const existingPagePositions = nodes
        .filter((node) => node.type === "page")
        .map((node) => node.position.x);
      const basePageX =
        existingPagePositions.length > 0
          ? Math.max(...existingPagePositions) + 360
          : 100;
      const basePageY = 100;

      const sourcePageNodes = nodesToCopy.filter(
        (node) => node.type === "page"
      );

      if (sourcePageNodes.length === 0) {
        setCopyFeedback({
          type: "error",
          message: "Selected workflow does not have any page nodes.",
        });
        return;
      }

      sourcePageNodes.forEach((pageNode, index) => {
        const newId = uniqueId(pageNode.id, existingNodeIds, "copy");
        idMap.set(pageNode.id, newId);
        existingNodeIds.add(newId);

        const dx = basePageX + index * 320 - pageNode.position.x;
        const dy = basePageY + index * 40 - pageNode.position.y;
        pageOffsets.set(pageNode.id, { dx, dy });

        const clonedData = deepCloneData(pageNode.data);
        nextPageNumber += 1;
        (clonedData as Record<string, unknown>).pageNumber = nextPageNumber;

        newRelationships[newId] = [];

        newNodes.push({
          ...pageNode,
          id: newId,
          position: {
            x: pageNode.position.x + dx,
            y: pageNode.position.y + dy,
          },
          data: clonedData,
        });
      });

      nodesToCopy.forEach((node) => {
        if (node.type === "page") {
          return;
        }

        const newId = uniqueId(node.id, existingNodeIds, "copy");
        idMap.set(node.id, newId);
        existingNodeIds.add(newId);

        const parentPageId = childToPage.get(node.id);
        const offset = parentPageId ? pageOffsets.get(parentPageId) : undefined;

        const clonedNode: Node = {
          ...node,
          id: newId,
          position: {
            x: node.position.x + (offset?.dx ?? 0),
            y: node.position.y + (offset?.dy ?? 0),
          },
          data: deepCloneData(node.data),
        };

        newNodes.push(clonedNode);

        if (parentPageId) {
          const parentNewId = idMap.get(parentPageId);
          if (parentNewId) {
            newRelationships[parentNewId] = [
              ...(newRelationships[parentNewId] || []),
              newId,
            ];
          }
        }
      });

      (workflowData.edges || [])
        .filter(
          (edge) =>
            nodeIdsToCopy.has(edge.source || "") &&
            nodeIdsToCopy.has(edge.target || "")
        )
        .forEach((edge) => {
          const newEdgeId = uniqueId(edge.id || "edge", existingEdgeIds, "copy");
          existingEdgeIds.add(newEdgeId);

          newEdges.push({
            ...edge,
            id: newEdgeId,
            source: edge.source ? idMap.get(edge.source) || edge.source : edge.source,
            target: edge.target ? idMap.get(edge.target) || edge.target : edge.target,
          });
        });

      const updatedPageRelationships = { ...pageRelationships };
      Object.entries(newRelationships).forEach(([pageId, nodeIds]) => {
        updatedPageRelationships[pageId] = nodeIds;
      });

      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);
      setPageRelationships(updatedPageRelationships);

      setCopyFeedback({
        type: "success",
        message: `Copied ${selectedPageIds.length} page${
          selectedPageIds.length > 1 ? "s" : ""
        } from ${workflowName}`,
      });
    },
    [nodes, edges, pageRelationships, setNodes, setEdges, setPageRelationships, workflowName]
  );

  // Handle node data updates
  const handleNodeDataUpdate = useCallback(
    (nodeId: string, updatedData: NodeData) => {
      setNodes((nds: Node[]) =>
        nds.map((node: Node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updatedData } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Custom handler for page node clicks
  const handlePageAddNodeClick = useCallback(
    (objectType?: string, sourceNodeId?: string, pageId?: string) => {
      if (pageId) {
        setCurrentPageId(pageId);
      }
      handleOpenSideMenu(objectType, sourceNodeId);
    },
    [handleOpenSideMenu]
  );

  // Dynamic node types - recreated when dependencies change to keep allNodes current
  const nodeTypes = React.useMemo(() => {
    return createAllNodeTypes({
      onAddNodeClick: handlePageAddNodeClick,
      edges,
      onDelete: handleDeleteNode,
      onSettings: (nodeId, nodeType, data) =>
        handleOpenSettings(nodeId, nodeType, data, (updatedData) =>
          handleNodeDataUpdate(nodeId, updatedData)
        ),
      onDataUpdate: handleNodeDataUpdate,
      workflowId,
      pageRelationships,
      nodes: nodes.map(node => ({ id: node.id, type: node.type || 'unknown' })),
    });
  }, [handlePageAddNodeClick, edges, handleDeleteNode, handleOpenSettings, handleNodeDataUpdate, workflowId, pageRelationships, nodes]);

  // Helper function to test nodeVariables function
  const testNodeVariables = useCallback(() => {
    console.log("🧪 Testing nodeVariables function on all nodes...");
    console.log("Current nodes:", nodes);
    console.log("Current edges:", edges);
    
    nodes.forEach((node) => {
      try {
        // Find the node class for this node type
        const nodeType = node.type;
        const NodeClass = nodeType ? NodeClasses[nodeType as keyof typeof NodeClasses] : null;
        
        if (NodeClass) {
          // Create a temporary instance with the node's props
          const nodeInstance = new (NodeClass as new (props: { id: string; data: unknown; edges: Edge[] }) => { nodeVariables: (nodes: Node[]) => Var[] })({
            id: node.id,
            data: node.data,
            edges: edges,
          });
          
          // Call the nodeVariables method
          const variables = nodeInstance.nodeVariables(nodes);
          
          console.log(`📝 Node ${node.id} (${nodeType}):`, {
            nodeData: node.data,
            variables: variables,
            variableCount: variables.length
          });
        } else {
          console.warn(`⚠️ No NodeClass found for node type: ${nodeType}`);
        }
      } catch (error) {
        console.error(`❌ Error testing node ${node.id}:`, error);
      }
    });
    
    console.log("✅ Node variables test complete!");
  }, [nodes, edges]);

  // Helper function to test variable index
  const testVariableIndex = useCallback(() => {
    console.log("📋 Testing variable index...");
    const variableIndex = createVariableIndex(nodes, edges);
    
    console.log("🔍 Variable Index Results:");
    console.log("Behaviors:", variableIndex.behaviors);
    console.log("Pages:", variableIndex.pages);
    
    // Pretty print for better readability
    console.log("\n📊 Formatted Results:");
    
    console.log("🎭 Behaviors by page:");
    Object.entries(variableIndex.behaviors).forEach(([pageNum, variables]) => {
      console.log(`  Page ${pageNum}: [${variables.join(', ')}]`);
    });
    
    console.log("📄 Pages by page:");
    Object.entries(variableIndex.pages).forEach(([pageNum, variables]) => {
      console.log(`  Page ${pageNum}: [${variables.join(', ')}]`);
    });
    
    console.log("✅ Variable index test complete!");
  }, [nodes, edges]);

  // Notify parent component of workflow changes
  useEffect(() => {
    if (onWorkflowChange) {
      onWorkflowChange(nodes, edges, pageRelationships);
    }
  }, [nodes, edges, pageRelationships, onWorkflowChange]);

  // Handle keyboard shortcuts:
  // - Ctrl+E: Export workflow JSON to console
  // - Ctrl+T: Test nodeVariables function on all nodes (output to console)
  // - Ctrl+I: Test variable index (output to console)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "e") {
        event.preventDefault();
        const workflowJSON = createWorkflowJSON(
          nodes,
          edges,
          pageRelationships
        );
        console.log(workflowJSON);
      }
      
      if (event.ctrlKey && event.key === "t") {
        event.preventDefault();
        testNodeVariables();
      }
      
      if (event.ctrlKey && event.key === "i") {
        event.preventDefault();
        testVariableIndex();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodes, edges, pageRelationships, testNodeVariables, testVariableIndex]);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !onWorkflowChange) return;

    const interval = setInterval(() => {
      onWorkflowChange(nodes, edges, pageRelationships);
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [
    nodes,
    edges,
    pageRelationships,
    autoSave,
    autoSaveInterval,
    onWorkflowChange,
  ]);

  // Deploy handler
  const handleDeploy = useCallback(async () => {
    setIsDeploying(true);
    setDeployError("");

    try {
      // Check if workflow has been saved
      if (
        !workflowId ||
        (typeof workflowId === "string" && workflowId === "new")
      ) {
        throw new Error(
          "Please save the workflow before deploying. Only saved workflows can be deployed."
        );
      }

      const numericWorkflowId =
        typeof workflowId === "string" ? parseInt(workflowId, 10) : workflowId;
      if (isNaN(numericWorkflowId)) {
        throw new Error("Invalid workflow ID. Please save the workflow first.");
      }

      // First test authentication
      console.log("Testing authentication before deployment...");
      try {
        const authResult = await BaseDeploymentAPI.debugAuth();
        console.log("Authentication successful:", authResult);
      } catch (authError) {
        console.error("Authentication failed:", authError);
        throw new Error(
          `Authentication failed: ${
            authError instanceof Error
              ? authError.message
              : "Unknown auth error"
          }`
        );
      }

      // Create workflow JSON
      console.log("Creating workflow JSON...");
      const workflowJSON = createWorkflowJSON(nodes, edges, pageRelationships);
      const workflowData = JSON.parse(workflowJSON);
      console.log("Workflow JSON created:", workflowData);

      // Deploy workflow
      console.log("Deploying workflow...");
      const response = await BaseDeploymentAPI.deployWorkflow(
        workflowName,
        numericWorkflowId,
        workflowData
      );
      console.log("Deployment successful:", response);

      if (onDeploySuccess) {
        onDeploySuccess(response.deployment_id, response.chat_url);
      }
    } catch (error) {
      console.error("Deployment error:", error);
      setDeployError(
        error instanceof Error ? error.message : "Deployment failed"
      );
    } finally {
      setIsDeploying(false);
    }
  }, [
    workflowId,
    nodes,
    edges,
    pageRelationships,
    workflowName,
    onDeploySuccess,
  ]);

  // Update global context whenever data changes
  React.useEffect(() => {
    const nodeData = nodes.map(node => ({ id: node.id, type: node.type || 'unknown' }));
    setGlobalNodeContext({
      pageRelationships,
      nodes: nodeData,
      fullNodes: nodes,
      getCurrentPageRelationships: () => pageRelationships,
      getCurrentNodes: () => nodeData,
      getCurrentFullNodes: () => nodes,
    });
  }, [pageRelationships, nodes]);

  return (
    <NodeContextProvider 
      pageRelationships={pageRelationships} 
      nodes={nodes.map(node => ({ id: node.id, type: node.type || 'unknown' }))}
      fullNodes={nodes}
    >
      <div style={{ width: "100%", height: "100%", backgroundColor: "#374151" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            style: { strokeWidth: 3, stroke: "orange" },
          }}
          proOptions={{ hideAttribution: true }}
          snapToGrid={true}
          snapGrid={[15, 15]}
          style={{ backgroundColor: "#374151" }}
          connectOnClick={false}
          connectionMode={ConnectionMode.Loose}
        >
          <Background gap={12} size={1} color="#6B7280" />
        </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-4 z-20">
          <button
            onClick={() => handleOpenSideMenu("Starter")}
            className="w-16 h-16 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center shadow-lg transition-all duration-200"
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </button>
          <span className="text-sm text-gray-400">
            Add your first node or page
          </span>
        </div>
      )}

      {/* Create Page and Behaviour Buttons - Bottom Left */}
      {(() => {
        // Check if we should show the New Page/Behaviour buttons
        const shouldShowNewPageButton = (() => {
          // If no nodes at all, show button
          if (nodes.length === 0) return true;
          
          // Get all non-page and non-behaviour nodes
          const nonContainerNodes = nodes.filter(node => node.type !== 'page' && node.type !== 'behaviour' && node.type !== 'globalVariables');
          
          // If no non-container nodes (only pages/behaviours/globalVariables exist), show button
          if (nonContainerNodes.length === 0) return true;
          
          // Get all nodes that are assigned to pages or behaviours
          const nodesInContainers = new Set();
          Object.values(pageRelationships).forEach(nodeIds => {
            nodeIds.forEach(nodeId => nodesInContainers.add(nodeId));
          });
          
          // Show buttons if there are unassigned nodes (need containers) OR if all nodes are properly contained (workspace is organized)
          const hasUnassignedNodes = nonContainerNodes.some(node => !nodesInContainers.has(node.id));
          const allNodesInContainers = nonContainerNodes.every(node => nodesInContainers.has(node.id));
          
          return hasUnassignedNodes || allNodesInContainers;
        })();

        return shouldShowNewPageButton ? (
          <div className="absolute bottom-6 left-6 z-10">
            <div className="flex flex-col space-y-3">

              {/* New Behaviour Button */}
              <button
                onClick={() => {
                  // Find the highest behaviour number among existing behaviours
                  const existingBehaviourNumbers = nodes
                    .filter(n => n.type === 'behaviour')
                    .map(n => n.data?.pageNumber || 1)
                    .filter(num => typeof num === 'number');
                  
                  const nextBehaviourNumber = existingBehaviourNumbers.length > 0 
                    ? Math.max(...existingBehaviourNumbers) + 1 
                    : 1;

                  const newBehaviour: Node = {
                    id: `behaviour-${Date.now()}`,
                    position: { x: 300, y: 300 },
                    data: { 
                      pageNumber: nextBehaviourNumber,
                      backgroundColor: '#8B5CF6',
                      opacity: 0.15,
                      width: 300,
                      height: 200
                    },
                    type: "behaviour",
                  };
                  setNodes((nds: Node[]) => [...nds, newBehaviour]);
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
                title="Create new behaviour"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>New Behaviour</span>
              </button>

              {/* New Page Button */}
              <button
                onClick={() => {
                  // Find the highest page number among existing pages
                  const existingPageNumbers = nodes
                    .filter(n => n.type === 'page')
                    .map(n => n.data?.pageNumber || 1)
                    .filter(num => typeof num === 'number');
                  
                  const nextPageNumber = existingPageNumbers.length > 0 
                    ? Math.max(...existingPageNumbers) + 1 
                    : 1;

                  const newPage: Node = {
                    id: `page-${Date.now()}`,
                    position: { x: 200, y: 200 },
                    data: { 
                      pageNumber: nextPageNumber,
                      backgroundColor: '#3B82F6',
                      opacity: 0.15,
                      width: 300,
                      height: 200
                    },
                    type: "page",
                  };
                  setNodes((nds: Node[]) => [...nds, newPage]);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
                title="Create new page"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>New Page</span>
              </button>
            </div>
          </div>
        ) : null;
      })()}

      {/* Page Sorter and Deploy Button - Bottom Right */}
      <div className="absolute bottom-6 right-6 z-10">
        <div className="space-y-3">
          {/* Page Sorter - Only shows when pages exist */}
          <PageSorter nodes={nodes} setNodes={setNodes} />

          <button
            className="w-full bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium shadow transition"
            onClick={() => setIsCopyModalOpen(true)}
          >
            Copy pages from workflow
          </button>

          {/* Deploy Button */}
          <div className="flex flex-col space-y-2">
            {deployError && (
              <div className="bg-red-900/90 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm max-w-xs">
                {deployError}
              </div>
            )}
            <button
              onClick={handleDeploy}
              disabled={
                isDeploying ||
                !workflowId ||
                (typeof workflowId === "string" && workflowId === "new")
              }
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
              title={
                !workflowId ||
                (typeof workflowId === "string" && workflowId === "new")
                  ? "Save workflow before deploying"
                  : "Deploy workflow"
              }
            >
              {isDeploying ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Deploying...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  <span>Deploy</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => {
          setCurrentPageId(undefined);
          handleCloseSideMenu();
        }}
        onAddNode={handleAddNode}
        objectType={sideMenuObjectType}
      />

      {settingsData && (
        <SettingsMenu
          isOpen={isSettingsOpen}
          nodeType={settingsData.nodeType}
          data={settingsData.data}
          onClose={handleCloseSettings}
          onSave={handleSaveSettings}
          workflowId={settingsData.workflowId}
          nodes={settingsData.nodes}
          edges={settingsData.edges}
          pageRelationships={settingsData.pageRelationships}
          currentNodeId={settingsData.nodeId}
        />
      )}

      <CopyPagesModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        onCopy={handleCopyPages}
        currentWorkflowId={typeof workflowId === "number" ? workflowId : undefined}
      />

      {copyFeedback && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white shadow-lg z-30 ${
            copyFeedback.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {copyFeedback.message}
        </div>
      )}
      </div>
    </NodeContextProvider>
  );
}
