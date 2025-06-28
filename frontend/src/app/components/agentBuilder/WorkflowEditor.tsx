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

import { createWorkflowJSON } from "./scripts/exportWorkflow";
import { DeploymentAPI } from "./scripts/deploymentAPI";

import "@xyflow/react/dist/style.css";

interface WorkflowEditorProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onWorkflowChange?: (nodes: Node[], edges: Edge[]) => void;
  autoSave?: boolean;
  autoSaveInterval?: number;
  workflowId?: string | number;
  workflowName?: string;
  onDeploySuccess?: (deploymentId: string, chatUrl: string) => void;
}

export default function WorkflowEditor({
  initialNodes = [
    { id: "1", position: { x: -15, y: -15 }, data: { label: "2" }, type: "chat" },
  ],
  initialEdges = [],
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
  } = useFlowState(initialNodes, initialEdges);

  const {
    isSideMenuOpen,
    sideMenuObjectType,
    sourceNodeId,
    handleOpenSideMenu,
    handleCloseSideMenu,
  } = useSideMenu();

  const { handleAddNode } = useNodeOperations(
    setNodes,
    setEdges,
    sourceNodeId,
    sideMenuObjectType,
    nodes
  );

  const {
    isSettingsOpen,
    settingsData,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
  } = useSettingsMenu(workflowId);

  // Handle node data updates
  const handleNodeDataUpdate = useCallback((nodeId: string, updatedData: NodeData) => {
    setNodes((nds: Node[]) =>
      nds.map((node: Node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...updatedData } }
          : node
      )
    );
  }, [setNodes]);

  // Dynamic node types - automatically discovers all available node types
  const nodeTypes = createAllNodeTypes({
    onAddNodeClick: handleOpenSideMenu,
    edges,
    onDelete: handleDeleteNode,
    onSettings: (nodeId, nodeType, data) =>
      handleOpenSettings(nodeId, nodeType, data, (updatedData) =>
        handleNodeDataUpdate(nodeId, updatedData)
      ),
    workflowId,
  });

  // Notify parent component of workflow changes
  useEffect(() => {
    if (onWorkflowChange) {
      onWorkflowChange(nodes, edges);
    }
  }, [nodes, edges, onWorkflowChange]);

  // Handle Ctrl+E keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'e') {
        event.preventDefault();
        const workflowJSON = createWorkflowJSON(nodes, edges);
        console.log(workflowJSON);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes, edges]);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !onWorkflowChange) return;

    const interval = setInterval(() => {
      onWorkflowChange(nodes, edges);
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [nodes, edges, autoSave, autoSaveInterval, onWorkflowChange]);

  // Deploy handler
  const handleDeploy = useCallback(async () => {
    setIsDeploying(true);
    setDeployError("");

    try {
      // Check if workflow has been saved
      if (!workflowId || typeof workflowId === 'string' && workflowId === 'new') {
        throw new Error("Please save the workflow before deploying. Only saved workflows can be deployed.");
      }

      const numericWorkflowId = typeof workflowId === 'string' ? parseInt(workflowId, 10) : workflowId;
      if (isNaN(numericWorkflowId)) {
        throw new Error("Invalid workflow ID. Please save the workflow first.");
      }

      // First test authentication
      console.log("Testing authentication before deployment...");
      try {
        const authResult = await DeploymentAPI.debugAuth();
        console.log("Authentication successful:", authResult);
      } catch (authError) {
        console.error("Authentication failed:", authError);
        throw new Error(`Authentication failed: ${authError instanceof Error ? authError.message : "Unknown auth error"}`);
      }

      // Create workflow JSON
      console.log("Creating workflow JSON...");
      const workflowJSON = createWorkflowJSON(nodes, edges);
      const workflowData = JSON.parse(workflowJSON);
      console.log("Workflow JSON created:", workflowData);

      // Deploy workflow
      console.log("Deploying workflow...");
      const response = await DeploymentAPI.deployWorkflow(workflowName, numericWorkflowId, workflowData);
      console.log("Deployment successful:", response);
      
      if (onDeploySuccess) {
        onDeploySuccess(response.deployment_id, response.chat_url);
      }
    } catch (error) {
      console.error("Deployment error:", error);
      setDeployError(error instanceof Error ? error.message : "Deployment failed");
    } finally {
      setIsDeploying(false);
    }
  }, [nodes, edges, workflowName, workflowId, onDeploySuccess]);

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
        <Background variant="dots" gap={12} size={1} color="#6B7280" bgColor="#374151"/>
      </ReactFlow>

      {/* Deploy Button - Bottom Right */}
      <div className="absolute bottom-6 right-6 z-10">
        <div className="space-y-2">
          {deployError && (
            <div className="bg-red-900/90 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm max-w-xs">
              {deployError}
            </div>
          )}
          <button
            onClick={handleDeploy}
            disabled={isDeploying || !workflowId || (typeof workflowId === 'string' && workflowId === 'new')}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
            title={(!workflowId || (typeof workflowId === 'string' && workflowId === 'new')) ? "Save workflow before deploying" : "Deploy workflow"}
          >
            {isDeploying ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Deploying...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={handleCloseSideMenu}
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
