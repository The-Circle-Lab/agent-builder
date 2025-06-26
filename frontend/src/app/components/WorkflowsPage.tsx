"use client";

import React, { useState, useEffect } from "react";
import { WorkflowAPI } from "./agentBuilder/scripts/workflowSave";
import { AuthAPI, User } from "./agentBuilder/scripts/authAPI";

interface Workflow {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowsPageProps {
  onLogout: () => void;
  onEditWorkflow: (workflowId: number | null) => void;
  onViewDeployments?: () => void;
}

export default function WorkflowsPage({ onLogout, onEditWorkflow, onViewDeployments }: WorkflowsPageProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userInfo, workflowList] = await Promise.all([
        AuthAPI.getCurrentUser(),
        WorkflowAPI.loadAllWorkflows()
      ]);
      setUser(userInfo);
      setWorkflows(workflowList);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AuthAPI.logout();
      onLogout();
    } catch (error) {
      console.error("Logout error:", error);
      // Force logout even if API call fails
      onLogout();
    }
  };

  const handleDeleteWorkflow = async (workflowId: number, workflowName: string) => {
    if (!confirm(`Are you sure you want to delete "${workflowName}"?`)) {
      return;
    }

    try {
      await WorkflowAPI.deleteWorkflow(workflowId);
      setWorkflows(prev => prev.filter(w => w.id !== workflowId));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete workflow");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agent Builder</h1>
              {user && (
                <p className="text-sm text-gray-600">Welcome, {user.email}</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition duration-200"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900">My Workflows</h2>
          <div className="flex space-x-4">
            {onViewDeployments && (
              <button
                onClick={onViewDeployments}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span>View Deployments</span>
              </button>
            )}
            <button
              onClick={() => onEditWorkflow(null)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Create New Workflow
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {workflows.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No workflows yet</h3>
            <p className="text-gray-600 mb-6">Create your first workflow to get started building agents.</p>
            <button
              onClick={() => onEditWorkflow(null)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200"
            >
              Create Your First Workflow
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition duration-200">
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 truncate">
                    {workflow.name}
                  </h3>
                  {workflow.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {workflow.description}
                    </p>
                  )}
                  <div className="text-xs text-gray-500 mb-4">
                    <p>Created: {formatDate(workflow.created_at)}</p>
                    <p>Updated: {formatDate(workflow.updated_at)}</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onEditWorkflow(workflow.id)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteWorkflow(workflow.id, workflow.name)}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition duration-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 
