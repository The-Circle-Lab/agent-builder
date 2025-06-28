"use client";

import React, { useState, useEffect } from "react";
import { AuthAPI } from "./components/agentBuilder/scripts/authAPI";
import LoginPage from "./components/loginPage";
import WorkflowsPage from "./components/workflowsPage";
import WorkflowEditorPage from "./components/workflowEditorPage";
import DeploymentsPage from "./components/deploymentsPage";
import { APP_STATES, type AppState } from "@/lib/constants";

export default function App() {
  const [appState, setAppState] = useState<AppState>(APP_STATES.LOADING);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const isAuthenticated = await AuthAPI.checkAuth();
      if (isAuthenticated) {
        setAppState(APP_STATES.WORKFLOWS);
      } else {
        setAppState(APP_STATES.LOGIN);
      }
    } catch {
      setAppState(APP_STATES.LOGIN);
    }
  };

  const handleLogin = () => {
    setAppState(APP_STATES.WORKFLOWS);
  };

  const handleLogout = () => {
    setAppState(APP_STATES.LOGIN);
  };

  const handleEditWorkflow = (workflowId: number | null) => {
    setCurrentWorkflowId(workflowId);
    setAppState(APP_STATES.EDITOR);
  };

  const handleBackToWorkflows = () => {
    setCurrentWorkflowId(null);  
    setAppState(APP_STATES.WORKFLOWS);
  };

  const handleViewDeployments = () => {
    setAppState(APP_STATES.DEPLOYMENTS);
  };

  // Loading state
  if (appState === APP_STATES.LOADING) {
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
  if (appState === APP_STATES.LOGIN) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Workflow editor page
  if (appState === APP_STATES.EDITOR) {
    return (
      <WorkflowEditorPage 
        workflowId={currentWorkflowId} 
        onBack={handleBackToWorkflows} 
      />
    );
  }

  // Deployments page
  if (appState === APP_STATES.DEPLOYMENTS) {
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
