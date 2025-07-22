"use client";

import React, { useState, useEffect } from "react";
import { AuthAPI, User } from "../../lib/authAPI";
import LoginPage from "./LoginPage";
import ClassesPage from "./classes/ClassesPage";
import ClassDetailPage from "./classes/ClassDetailPage";
import ChatInterface from "./deployments/chat/chatInterface";
import CodeInterface from "./deployments/code/codeInterface";
import { MCQInterface } from "./deployments/mcq";
import WorkflowEditorPage from "./WorkflowEditorPage";
import { APP_STATES, type AppState } from "@/lib/constants";
import { Class } from "@/lib/types";

export default function App() {
  const [appState, setAppState] = useState<AppState>(APP_STATES.LOADING);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(
    null
  );
  const [currentDeploymentId, setCurrentDeploymentId] = useState<string | null>(
    null
  );
  const [currentDeploymentName, setCurrentDeploymentName] =
    useState<string>("");

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const user = await AuthAPI.getCurrentUser();
      setCurrentUser(user);
      setAppState(APP_STATES.CLASSES);
    } catch {
      setAppState(APP_STATES.LOGIN);
    }
  };

  const handleLogin = async () => {
    try {
      const user = await AuthAPI.getCurrentUser();
      setCurrentUser(user);
      setAppState(APP_STATES.CLASSES);
    } catch (err) {
      console.error("Failed to get user info after login:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await AuthAPI.logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
    setCurrentUser(null);
    setCurrentClass(null);
    setCurrentWorkflowId(null);
    setCurrentDeploymentId(null);
    setAppState(APP_STATES.LOGIN);
  };

  const handleSelectClass = (classObj: Class) => {
    setCurrentClass(classObj);
    setAppState(APP_STATES.CLASS_DETAIL);
  };

  const handleBackToClasses = () => {
    setCurrentClass(null);
    setAppState(APP_STATES.CLASSES);
  };

  const handleEditWorkflow = (workflowId: number) => {
    setCurrentWorkflowId(workflowId);
    setAppState(APP_STATES.EDITOR);
  };

  const handleBackFromEditor = () => {
    setCurrentWorkflowId(null);
    setAppState(APP_STATES.CLASS_DETAIL);
  };

  const handleChatWithDeployment = (
    deploymentId: string,
    deploymentName: string
  ) => {
    setCurrentDeploymentId(deploymentId);
    setCurrentDeploymentName(deploymentName);
    setAppState(APP_STATES.CHAT);
  };

  const handleCodeWithDeployment = (
    deploymentId: string,
    deploymentName: string
  ) => {
    setCurrentDeploymentId(deploymentId);
    setCurrentDeploymentName(deploymentName);
    setAppState(APP_STATES.CODE);
  };

  const handleMCQWithDeployment = (
    deploymentId: string,
    deploymentName: string
  ) => {
    setCurrentDeploymentId(deploymentId);
    setCurrentDeploymentName(deploymentName);
    setAppState(APP_STATES.MCQ);
  };

  const handleBackFromChat = () => {
    setCurrentDeploymentId(null);
    setAppState(APP_STATES.CLASS_DETAIL);
  };

  const handleBackFromCode = () => {
    setCurrentDeploymentId(null);
    setAppState(APP_STATES.CLASS_DETAIL);
  };

  const handleBackFromMCQ = () => {
    setCurrentDeploymentId(null);
    setAppState(APP_STATES.CLASS_DETAIL);
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

  // Ensure we have a user for authenticated pages
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Session expired. Please log in again.</p>
          <button
            onClick={() => setAppState(APP_STATES.LOGIN)}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Classes list page
  if (appState === APP_STATES.CLASSES) {
    return (
      <ClassesPage
        user={currentUser}
        onSelectClass={handleSelectClass}
        onLogout={handleLogout}
      />
    );
  }

  // Class detail page
  if (appState === APP_STATES.CLASS_DETAIL && currentClass) {
    return (
      <ClassDetailPage
        classObj={currentClass}
        onBack={handleBackToClasses}
        onEditWorkflow={handleEditWorkflow}
        onChatWithDeployment={handleChatWithDeployment}
        onCodeWithDeployment={handleCodeWithDeployment}
        onMCQWithDeployment={handleMCQWithDeployment}
      />
    );
  }

  // Workflow editor page
  if (appState === APP_STATES.EDITOR && currentWorkflowId) {
    return (
      <WorkflowEditorPage
        workflowId={currentWorkflowId}
        onBack={handleBackFromEditor}
      />
    );
  }

  // Chat interface
  if (appState === APP_STATES.CHAT && currentDeploymentId) {
    return (
      <ChatInterface
        deploymentId={currentDeploymentId}
        workflowName={currentDeploymentName}
        onBack={handleBackFromChat}
      />
    );
  }

  // Code interface
  if (appState === APP_STATES.CODE && currentDeploymentId) {
    return (
      <CodeInterface
        deploymentId={currentDeploymentId}
        workflowName={currentDeploymentName}
        onBack={handleBackFromCode}
      />
    );
  }

  // MCQ interface
  if (appState === APP_STATES.MCQ && currentDeploymentId) {
    return (
      <MCQInterface
        deploymentId={currentDeploymentId}
        deploymentName={currentDeploymentName}
        onClose={handleBackFromMCQ}
      />
    );
  }

  // Default to classes page
  return (
    <ClassesPage
      user={currentUser}
      onSelectClass={handleSelectClass}
      onLogout={handleLogout}
    />
  );
}
