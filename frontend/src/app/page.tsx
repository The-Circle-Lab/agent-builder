"use client";

import React, { useState, useEffect } from "react";
import { AuthAPI } from "./components/agentBuilder/scripts/authAPI";
import LoginPage from "./components/LoginPage";
import WorkflowsPage from "./components/WorkflowsPage";
import WorkflowEditorPage from "./components/WorkflowEditorPage";
import DeploymentsPage from "./components/DeploymentsPage";

type AppState = "loading" | "login" | "workflows" | "editor" | "deployments";

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const isAuthenticated = await AuthAPI.checkAuth();
      if (isAuthenticated) {
        setAppState("workflows");
      } else {
        setAppState("login");
      }
    } catch {
      setAppState("login");
    }
  };

  const handleLogin = () => {
    setAppState("workflows");
  };

  const handleLogout = () => {
    setAppState("login");
  };

  const handleEditWorkflow = (workflowId: number | null) => {
    setCurrentWorkflowId(workflowId);
    setAppState("editor");
  };

    const handleBackToWorkflows = () => {
    setCurrentWorkflowId(null);  
    setAppState("workflows");
  };

  const handleViewDeployments = () => {
    setAppState("deployments");
  };

  // Loading state
  if (appState === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  // Login page
  if (appState === "login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Workflow editor page
  if (appState === "editor") {
    return (
      <WorkflowEditorPage 
        workflowId={currentWorkflowId} 
        onBack={handleBackToWorkflows} 
      />
    );
  }

  // Deployments page
  if (appState === "deployments") {
    return (
      <DeploymentsPage 
        onLogout={handleLogout} 
        onBack={handleBackToWorkflows} 
      />
    );
  }

  // Workflows list page (default)
  return (
    <WorkflowsPage 
      onLogout={handleLogout} 
      onEditWorkflow={handleEditWorkflow}
      onViewDeployments={handleViewDeployments}
    />
  );
}
