"use client";

import React, { useEffect, useCallback, useState } from "react";
import { ReactFlow, Edge, Background, Node } from "@xyflow/react";
import { useFlowState } from "./hooks/useFlowState";
import {
  createAllNodeTypes,
  NodeData,
  useNodeOperations,
} from "./components/nodes";
import { SideMenu, useSideMenu } from "./components/sideMenu";
import {
  SettingsMenu,
  useSettingsMenu,
} from "./components/nodes/components/settingsMenu";
import PageSorter from "./components/pageSorter";

import { createWorkflowJSON } from "./scripts/exportWorkflow";
import { BaseDeploymentAPI } from "../../../lib/deploymentAPIs/deploymentAPI";

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
  } = useSettingsMenu(workflowId);

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

  // Dynamic node types - automatically discovers all available node types
  const nodeTypes = createAllNodeTypes({
    onAddNodeClick: handlePageAddNodeClick,
    edges,
    onDelete: handleDeleteNode,
    onSettings: (nodeId, nodeType, data) =>
      handleOpenSettings(nodeId, nodeType, data, (updatedData) =>
        handleNodeDataUpdate(nodeId, updatedData)
      ),
    workflowId,
    pageRelationships,
    nodes: nodes.map((node) => ({ id: node.id, type: node.type || "unknown" })),
  });

  // Notify parent component of workflow changes
  useEffect(() => {
    if (onWorkflowChange) {
      onWorkflowChange(nodes, edges, pageRelationships);
    }
  }, [nodes, edges, pageRelationships, onWorkflowChange]);

  // Handle Ctrl+E keyboard shortcut
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
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodes, edges, pageRelationships]);

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

  return (
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

      {/* Create Page Button - Bottom Left (only show if no nodes or all nodes are in pages) */}
      {(() => {
        // Check if we should show the New Page button
        const shouldShowNewPageButton = (() => {
          // If no nodes at all, show button
          if (nodes.length === 0) return true;

          // Get all non-page nodes
          const nonPageNodes = nodes.filter((node) => node.type !== "page");

          // If no non-page nodes (only pages exist), show button
          if (nonPageNodes.length === 0) return true;

          // Get all nodes that are assigned to pages
          const nodesInPages = new Set();
          Object.values(pageRelationships).forEach((nodeIds) => {
            nodeIds.forEach((nodeId) => nodesInPages.add(nodeId));
          });

          // Check if all non-page nodes are contained in pages
          const allNodesInPages = nonPageNodes.every((node) =>
            nodesInPages.has(node.id)
          );

          return allNodesInPages;
        })();

        return shouldShowNewPageButton ? (
          <div className="absolute bottom-6 left-6 z-10">
            <button
              onClick={() => {
                // Find the highest page number among existing pages
                const existingPageNumbers = nodes
                  .filter((n) => n.type === "page")
                  .map((n) => n.data?.pageNumber || 1)
                  .filter((num) => typeof num === "number");

                const nextPageNumber =
                  existingPageNumbers.length > 0
                    ? Math.max(...existingPageNumbers) + 1
                    : 1;

                const newPage: Node = {
                  id: `page-${Date.now()}`,
                  position: { x: 200, y: 200 },
                  data: {
                    pageNumber: nextPageNumber,
                    backgroundColor: "#3B82F6",
                    opacity: 0.15,
                    width: 300,
                    height: 200,
                  },
                  type: "page",
                };
                setNodes((nds: Node[]) => [...nds, newPage]);
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
              title="Create new page"
            >
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              <span>New Page</span>
            </button>
          </div>
        ) : null;
      })()}

      {/* Page Sorter and Deploy Button - Bottom Right */}
      <div className="absolute bottom-6 right-6 z-10">
        <div className="space-y-3">
          {/* Page Sorter - Only shows when pages exist */}
          <PageSorter nodes={nodes} setNodes={setNodes} />

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
        />
      )}
    </div>
  );
}
