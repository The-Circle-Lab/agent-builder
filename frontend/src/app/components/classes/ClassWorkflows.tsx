"use client";

import React, { useState } from 'react';
import { Workflow } from '@/lib/types';
import { PlusIcon, PencilIcon, RocketLaunchIcon, BeakerIcon } from '@heroicons/react/24/outline';

interface ClassWorkflowsProps {
  workflows: Workflow[];
  onCreateWorkflow: (name: string, description?: string) => Promise<Workflow>;
  onEditWorkflow: (workflowId: number) => void;
  onDeployWorkflow: (workflow: Workflow) => Promise<{ deployment_id: string; chat_url: string }>;
  onDeleteWorkflow: (workflowId: number) => Promise<void>;
}

export default function ClassWorkflows({ 
  workflows, 
  onCreateWorkflow, 
  onEditWorkflow,
  onDeployWorkflow,
  onDeleteWorkflow 
}: ClassWorkflowsProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workflow name is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await onCreateWorkflow(name.trim(), description.trim() || undefined);
      
      // Reset form
      setName('');
      setDescription('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const handleDeploy = async (workflow: Workflow) => {
    try {
      setDeployingId(workflow.id);
      await onDeployWorkflow(workflow);
    } catch (err) {
      console.error('Failed to deploy workflow:', err);
      alert(err instanceof Error ? err.message : 'Failed to deploy workflow');
    } finally {
      setDeployingId(null);
    }
  };

  const handleDelete = async (workflowId: number, workflowName: string) => {
    if (!confirm(`Are you sure you want to delete "${workflowName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(workflowId);
      await onDeleteWorkflow(workflowId);
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete workflow');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Workflows</h2>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Workflow
            </button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Create New Workflow</h3>
          <form onSubmit={handleCreate}>
            <div className="space-y-4">
              <div>
                <label htmlFor="workflow-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  type="text"
                  id="workflow-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                  placeholder=""
                  required
                />
              </div>

              <div>
                <label htmlFor="workflow-description" className="block text-sm font-medium text-gray-700">
                  Description (Optional)
                </label>
                <textarea
                  id="workflow-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                  placeholder=""
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-600">{error}</div>
            )}

            <div className="mt-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setName('');
                  setDescription('');
                  setError(null);
                }}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workflows List */}
      {workflows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BeakerIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No workflows yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a workflow to start building AI agents for your students.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {workflows.map(workflow => (
            <div
              key={workflow.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{workflow.name}</h3>
                  {workflow.description && (
                    <p className="mt-2 text-sm text-gray-500">{workflow.description}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    Created {new Date(workflow.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <button
                    onClick={() => onEditWorkflow(workflow.id)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    title="Edit workflow"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeploy(workflow)}
                    disabled={deployingId === workflow.id}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Deploy workflow"
                  >
                    <RocketLaunchIcon className="h-4 w-4 mr-2" />
                    {deployingId === workflow.id ? 'Deploying...' : 'Deploy'}
                  </button>
                  <button
                    onClick={() => handleDelete(workflow.id, workflow.name)}
                    disabled={deletingId === workflow.id}
                    className="h-10 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete workflow"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 8.142A2 2 0 0116.138 17H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 
