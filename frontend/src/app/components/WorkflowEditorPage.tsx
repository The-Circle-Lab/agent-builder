"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { WorkflowAPI, AutoSave } from "./agentBuilder/scripts/workflowSave";
import { ReactFlowNode, ReactFlowEdge } from "@/lib/types";

// Dynamically import WorkflowEditor to avoid SSR issues with ReactFlow
const WorkflowEditor = dynamic(() => import("./agentBuilder/workflowEditor"), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="text-gray-600">Loading workflow editor...</span>
      </div>
    </div>
  )
});

interface WorkflowEditorPageProps {
  workflowId: number | null;
  onBack: () => void;
}

export default function WorkflowEditorPage({ workflowId, onBack }: WorkflowEditorPageProps) {
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(workflowId);
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  
  // Start with an empty canvas for new workflows
  const [initialNodes] = useState<ReactFlowNode[]>([]);
  const [initialEdges] = useState<ReactFlowEdge[]>([]);

  const [currentNodes, setCurrentNodes] = useState<ReactFlowNode[]>(initialNodes);
  const [currentEdges, setCurrentEdges] = useState<ReactFlowEdge[]>(initialEdges);
  const [deploymentSuccess, setDeploymentSuccess] = useState<string>("");

  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    
    try {
      setLoading(true);
      const workflow = await WorkflowAPI.loadWorkflow(workflowId);
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description || "");
      
      // Load workflow data if it exists and has nodes
      if (workflow.workflow_data && workflow.workflow_data.nodes && workflow.workflow_data.nodes.length > 0) {
        setCurrentNodes(workflow.workflow_data.nodes);
        setCurrentEdges(workflow.workflow_data.edges || []);
      } else {
        // If no workflow data or empty nodes, keep the empty initial state
        setCurrentNodes(initialNodes);
        setCurrentEdges(initialEdges);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [workflowId, initialNodes, initialEdges]);

  useEffect(() => {
    if (workflowId) {
      loadWorkflow();
    }
  }, [workflowId, loadWorkflow]);

  const handleWorkflowChange = useCallback((nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => {
    setCurrentNodes(nodes);
    setCurrentEdges(edges);
    setSaveStatus("unsaved");

    // Auto-save after 2 seconds of inactivity
    AutoSave.scheduleAutoSave(
      currentWorkflowId,
      workflowName,
      workflowDescription,
      nodes,
      edges,
      (result: unknown) => {
        // If this is a new workflow, update the ID
        const resultObj = result as { id?: number };
        if (!currentWorkflowId && resultObj.id) {
          setCurrentWorkflowId(resultObj.id);
        }
        setSaveStatus("saved");
      },
      (error) => {
        setSaveStatus("error");
        console.error("Auto-save error:", error);
      }
    );
  }, [currentWorkflowId, workflowName, workflowDescription]);

  const handleManualSave = async () => {
    try {
      setSaveStatus("saving");
      const result = await WorkflowAPI.saveWorkflow(
        currentWorkflowId,
        workflowName,
        workflowDescription,
        currentNodes,
        currentEdges
      );
      
      // If this is a new workflow, update the ID
      if (!currentWorkflowId && result.id) {
        setCurrentWorkflowId(result.id);
      }
      
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setError(error instanceof Error ? error.message : "Failed to save workflow");
    }
  };

  const handleNameChange = (newName: string) => {
    setWorkflowName(newName);
    setSaveStatus("unsaved");
  };

  const handleDescriptionChange = (newDescription: string) => {
    setWorkflowDescription(newDescription);
    setSaveStatus("unsaved");
  };

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      AutoSave.cancelAutoSave();
    };
  }, []);

  const handleDeploymentSuccess = (deploymentId: string, chatUrl: string) => {
    setDeploymentSuccess(`Successfully deployed! Chat URL: ${chatUrl}`);
    // Auto-hide success message after 5 seconds
    setTimeout(() => setDeploymentSuccess(""), 5000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Loading workflow...</span>
        </div>
      </div>
    );
  }

  const getSaveStatusColor = () => {
    switch (saveStatus) {
      case "saved": return "text-green-600";
      case "saving": return "text-blue-600";
      case "unsaved": return "text-yellow-600";
      case "error": return "text-red-600";
    }
  };

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case "saved": return "All changes saved";
      case "saving": return "Saving...";
      case "unsaved": return "Unsaved changes";
      case "error": return "Save failed";
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Workflows</span>
            </button>
            
            <div className="border-l border-gray-300 pl-4">
              <input
                type="text"
                value={workflowName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="text-xl font-semibold text-gray-900 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-blue-500 rounded px-2 py-1"
                placeholder="Workflow name"
              />
              <input
                type="text"
                value={workflowDescription}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                className="block text-sm text-gray-600 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-blue-500 rounded px-2 py-1 mt-1"
                placeholder="Add description (optional)"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className={`text-sm ${getSaveStatusColor()} flex items-center space-x-1`}>
              {saveStatus === "saving" && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              )}
              <span>{getSaveStatusText()}</span>
            </div>
            
            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
            >
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={() => setError("")}
              className="ml-2 text-red-800 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}

        {deploymentSuccess && (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
            {deploymentSuccess}
            <button
              onClick={() => setDeploymentSuccess("")}
              className="ml-2 text-green-800 hover:text-green-900"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Workflow Editor */}
      <div className="flex-1">
        <WorkflowEditor
          initialNodes={currentNodes}
          initialEdges={currentEdges}
          onWorkflowChange={handleWorkflowChange}
          workflowId={currentWorkflowId || undefined}
          workflowName={workflowName}
          onDeploySuccess={handleDeploymentSuccess}
        />
      </div>
    </div>
  );
} 
