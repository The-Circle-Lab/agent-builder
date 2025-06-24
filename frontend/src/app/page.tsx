"use client";

import React, { useEffect } from "react";
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
import {
  checkWorkflowValidity,
  createWorkflowJSON,
} from "./scripts/exportWorkflow";

import "@xyflow/react/dist/style.css";

const initialNodes = [
  { id: "1", position: { x: -15, y: -15 }, data: { label: "2" }, type: "chat" },
];
const initialEdges: Edge[] = [];

export default function App() {
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
  } = useSettingsMenu();

  // Handle node data updates
  const handleNodeDataUpdate = (nodeId: string, updatedData: NodeData) => {
    setNodes((nds: Node[]) =>
      nds.map((node: Node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...updatedData } }
          : node
      )
    );
  };

  // Dynamic node types - automatically discovers all available node types
  const nodeTypes = createAllNodeTypes({
    onAddNodeClick: handleOpenSideMenu,
    edges,
    onDelete: handleDeleteNode,
    onSettings: (nodeId, nodeType, data) =>
      handleOpenSettings(nodeId, nodeType, data, (updatedData) =>
        handleNodeDataUpdate(nodeId, updatedData)
      ),
  });

  // Handle Ctrl+D keyboard shortcut for workflow validation test
  // Handle Ctrl+E keyboard shortcut for workflow export test
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "d") {
        event.preventDefault();
        const isValid = checkWorkflowValidity(nodes, edges);
        alert(`Workflow is ${isValid ? "valid" : "invalid"}`);
      }
      if (event.ctrlKey && event.key === "e") {
        event.preventDefault();
        try {
        const workflowJSON = createWorkflowJSON(nodes, edges);
          console.log(workflowJSON);
          alert("JSON logged to console");
        } catch (error) {
          alert(`Failed to create workflow JSON\n${error}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges]);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
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
      >
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>

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
        />
      )}
    </div>
  );
}
