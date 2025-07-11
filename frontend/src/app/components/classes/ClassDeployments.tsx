"use client";

import React, { useState, useEffect } from 'react';
import { Deployment } from '@/lib/types';
import { DeploymentAPI } from '../agentBuilder/scripts/deploymentAPI';
import { 
  ChatBubbleLeftRightIcon, 
  TrashIcon, 
  UsersIcon,
  RocketLaunchIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';

interface ClassDeploymentsProps {
  deployments: Deployment[];
  isInstructor: boolean;
  onChatWithDeployment: (deploymentId: string, deploymentName: string) => void;
  onCodeWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onDeleteDeployment: (deploymentId: string) => Promise<void>;
  onViewStudentChats: (deploymentId: string) => Promise<void>;
  onViewStudentSubmissions?: (deploymentId: string, deploymentName: string) => void;
}

export default function ClassDeployments({ 
  deployments, 
  isInstructor,
  onChatWithDeployment,
  onCodeWithDeployment,
  onDeleteDeployment,
  onViewStudentChats,
  onViewStudentSubmissions 
}: ClassDeploymentsProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deploymentTypes, setDeploymentTypes] = useState<Record<string,string>>({});

  // Determine deployment types on mount / prop change
  useEffect(() => {
    const determineTypes = async () => {
      const types: Record<string,string> = {};
      const unknown: string[] = [];
      deployments.forEach(d=>{
        if (d.type) types[d.deployment_id]=d.type;
        else unknown.push(d.deployment_id);
      });
      if (unknown.length>0){
        await Promise.all(unknown.map(async id=>{
          try{ const resp = await DeploymentAPI.getDeploymentType(id); types[id]=resp.type;}catch{types[id]="chat";}
        }));
      }
      setDeploymentTypes(types);
    };
    determineTypes();
  }, [deployments]);

  const handleDelete = async (deploymentId: string) => {
    if (!confirm('Are you sure you want to delete this deployment? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(deploymentId);
      await onDeleteDeployment(deploymentId);
    } catch (err) {
      console.error('Failed to delete deployment:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete deployment');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">Active Deployments</h2>
        <p className="mt-1 text-sm text-gray-500">
          {isInstructor 
            ? 'Manage and monitor student interactions with deployed AI agents.'
            : 'Chat with AI agents deployed by your instructor.'}
        </p>
      </div>

      {/* Deployments List */}
      {deployments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <RocketLaunchIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No active deployments</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isInstructor 
              ? 'Deploy a workflow to make it available for students to chat with.'
              : 'No AI agents are currently available. Check back later.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {deployments.map(deployment => (
            <div
              key={deployment.deployment_id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium text-gray-900">
                      {deployment.workflow_name}
                    </h3>
                    {deployment.is_loaded && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-1 text-xs text-gray-500 space-y-1">
                    { (deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat') === 'chat' && deployment.configuration?.model && (
                      <p>Model: {deployment.configuration.model}</p>
                    )}
                    {deployment.configuration?.provider && (
                      <p>Provider: {deployment.configuration.provider}</p>
                    )}
                    {(deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat') === 'chat' && deployment.configuration?.has_rag && (
                      <p>RAG: Enabled</p>
                    )}
                    <p>Deployed: {new Date(deployment.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {(()=>{ const depType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat'; const isCode=depType==='code'; return (
                    <button
                      onClick={()=> {
                        if (isCode && onCodeWithDeployment) {
                          onCodeWithDeployment(deployment.deployment_id, deployment.workflow_name);
                        } else {
                          onChatWithDeployment(deployment.deployment_id, deployment.workflow_name);
                        }
                      }}
                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white ${isCode?'bg-purple-600 hover:bg-purple-700':'bg-blue-600 hover:bg-blue-700'}`}
                      title={isCode? 'Solve this code challenge':'Chat with this deployment'}
                    >
                      {isCode? <RocketLaunchIcon className="h-3 w-3 mr-1"/> : <ChatBubbleLeftRightIcon className="h-3 w-3 mr-1"/>}
                      {isCode? 'Code':'Chat'}
                    </button>
                  );})()}
                  
                  {isInstructor && (
                    <>
                      <button
                        onClick={() => {
                          const depType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
                          if (depType === 'code' && onViewStudentSubmissions) {
                            onViewStudentSubmissions(deployment.deployment_id, deployment.workflow_name);
                          } else {
                            onViewStudentChats(deployment.deployment_id);
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                        title={deploymentTypes[deployment.deployment_id] === 'code' ? 'View student submissions' : 'View student conversations'}
                      >
                        <UsersIcon className="h-3 w-3 mr-1" />
                        Students
                      </button>
                      
                      <button
                        onClick={() => handleDelete(deployment.deployment_id)}
                        disabled={deletingId === deployment.deployment_id}
                        className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                        title="Delete deployment"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isInstructor && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center text-xs text-gray-500">
                    <ChartBarIcon className="h-3 w-3 mr-1" />
                    <span>Quick Stats: View student conversations to see usage</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 
