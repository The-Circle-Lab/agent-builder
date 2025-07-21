"use client";

import React, { useState, useEffect } from 'react';
import { Deployment } from '@/lib/types';
import { BaseDeploymentAPI } from '../../../lib/deploymentAPI';
import { 
  ChatBubbleLeftRightIcon, 
  TrashIcon, 
  UsersIcon,
  RocketLaunchIcon,
  ChartBarIcon,
  AcademicCapIcon,
  LockClosedIcon,
  LockOpenIcon,
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';

interface StudentGrade {
  user_id: number;
  email: string;
  points_earned: number;
  total_points: number;
  percentage: number;
  calculated_at: string;
}

interface IndividualGradesData {
  deployment_id: string;
  grading_method: string;
  student_grades: StudentGrade[];
  class_summary: {
    total_students: number;
    total_points_earned: number;
    total_points_possible: number;
    class_average: number;
  };
}

interface ClassDeploymentsProps {
  deployments: Deployment[];
  isInstructor: boolean;
  onChatWithDeployment: (deploymentId: string, deploymentName: string) => void;
  onCodeWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onMCQWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onDeleteDeployment: (deploymentId: string) => Promise<void>;
  onViewStudentChats: (deploymentId: string) => Promise<void>;
  onViewStudentSubmissions?: (deploymentId: string, deploymentName: string) => void;
  onViewStudentMCQ?: (deploymentId: string, deploymentName: string) => void;
}

export default function ClassDeployments({ 
  deployments, 
  isInstructor,
  onChatWithDeployment,
  onCodeWithDeployment,
  onMCQWithDeployment,
  onDeleteDeployment,
  onViewStudentChats,
  onViewStudentSubmissions,
  onViewStudentMCQ 
}: ClassDeploymentsProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deploymentTypes, setDeploymentTypes] = useState<Record<string,string>>({});
  const [deploymentStates, setDeploymentStates] = useState<Record<string, boolean>>({});
  const [togglingStates, setTogglingStates] = useState<Record<string, boolean>>({});
  const [individualGrades, setIndividualGrades] = useState<Record<string, IndividualGradesData>>({});
  const [loadingGrades, setLoadingGrades] = useState<Record<string, boolean>>({});

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
          try{ const resp = await BaseDeploymentAPI.getDeploymentType(id); types[id]=resp.type;}catch{types[id]="chat";}
        }));
      }
      setDeploymentTypes(types);
    };
    determineTypes();

    // Initialize deployment states (assume open by default, real state will be fetched if needed)
    const states: Record<string, boolean> = {};
    deployments.forEach(d => {
      states[d.deployment_id] = d.is_open ?? true; // Default to open if not specified
    });
    setDeploymentStates(states);
  }, [deployments]);

  // Fetch individual grades for CODE and MCQ deployments
  useEffect(() => {
    const fetchIndividualGrades = async () => {
      const gradedDeployments = deployments.filter(d => {
        const type = deploymentTypes[d.deployment_id] ?? d.type ?? 'chat';
        return type === 'code' || type === 'mcq';
      });

      for (const deployment of gradedDeployments) {
        if (individualGrades[deployment.deployment_id]) continue; // Already loaded

        setLoadingGrades(prev => ({ ...prev, [deployment.deployment_id]: true }));
        
        try {
          // Try both grading methods to see which one has data
          const methods = ['problem_correct', 'test_cases_correct'];
          let gradesData = null;

          for (const method of methods) {
            try {
              const response = await fetch(
                `${API_CONFIG.BASE_URL}/api/deploy/${deployment.deployment_id}/student-grades?grading_method=${method}`,
                { credentials: 'include' }
              );

              if (response.ok) {
                const data = await response.json();
                if (data.student_grades && data.student_grades.length > 0) {
                  gradesData = data;
                  break;
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch grades for method ${method}:`, err);
            }
          }

          if (gradesData) {
            setIndividualGrades(prev => ({
              ...prev,
              [deployment.deployment_id]: gradesData
            }));
          }
        } catch (err) {
          console.error(`Failed to fetch individual grades for deployment ${deployment.deployment_id}:`, err);
        } finally {
          setLoadingGrades(prev => ({ ...prev, [deployment.deployment_id]: false }));
        }
      }
    };

    // Only fetch if we have deployment types loaded
    if (Object.keys(deploymentTypes).length > 0) {
      fetchIndividualGrades();
    }
  }, [deployments, deploymentTypes, individualGrades]);

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

  const handleToggleDeploymentState = async (deploymentId: string) => {
    try {
      setTogglingStates(prev => ({ ...prev, [deploymentId]: true }));
      
      const currentState = deploymentStates[deploymentId] ?? true;
      const endpoint = currentState ? 'close' : 'open';
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setDeploymentStates(prev => ({ ...prev, [deploymentId]: result.is_open }));

    } catch (err) {
      console.error('Failed to toggle deployment state:', err);
      alert(err instanceof Error ? err.message : 'Failed to toggle deployment state');
    } finally {
      setTogglingStates(prev => ({ ...prev, [deploymentId]: false }));
    }
  };

  const renderGradeDisplay = (deployment: Deployment) => {
    const deploymentType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
    
    if (deploymentType !== 'code' && deploymentType !== 'mcq') return null;

    const grades = individualGrades[deployment.deployment_id];
    const isLoading = loadingGrades[deployment.deployment_id];

    if (isLoading) {
      return (
        <div className="flex items-center space-x-1">
          <AcademicCapIcon className="h-3 w-3 text-gray-400 animate-pulse" />
          <span className="text-gray-500 text-xs">Loading grades...</span>
        </div>
      );
    }

    if (!grades) {
      return (
        <div className="flex items-center space-x-1">
          <AcademicCapIcon className="h-3 w-3 text-gray-400" />
          <span className="text-gray-500 text-xs">No grades calculated</span>
        </div>
      );
    }

    if (isInstructor) {
      // For instructors, show class summary
      return (
        <div className="flex items-center space-x-1">
          <AcademicCapIcon className="h-3 w-3 text-blue-600" />
          <span className="text-blue-700 font-medium text-xs">
            Class Average: {grades.class_summary.class_average.toFixed(1)}% 
            ({grades.class_summary.total_students} students)
          </span>
        </div>
      );
    } else {
      // For students, show their individual grade
      // Backend now filters to return only the student's own grade
      const studentGrade = grades.student_grades[0]; // Should be their own grade
      
      if (studentGrade) {
        const colorClass = studentGrade.percentage >= 80 
          ? 'text-green-700' 
          : studentGrade.percentage >= 60 
            ? 'text-yellow-700' 
            : 'text-red-700';
        
        return (
          <div className="flex items-center space-x-1">
            <AcademicCapIcon className="h-3 w-3 text-green-600" />
            <span className={`font-medium text-xs ${colorClass}`}>
              Your Grade: {studentGrade.points_earned}/{studentGrade.total_points} ({studentGrade.percentage.toFixed(1)}%)
            </span>
          </div>
        );
      } else {
        // Student has no grade yet
        return (
          <div className="flex items-center space-x-1">
            <AcademicCapIcon className="h-3 w-3 text-gray-400" />
            <span className="text-gray-500 text-xs">No grade yet</span>
          </div>
        );
      }
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
          {deployments.map(deployment => {
            const isOpen = deploymentStates[deployment.deployment_id] ?? true;
            const isDisabled = !isOpen;
            
            return (
            <div
              key={deployment.deployment_id}
              className={`rounded-lg shadow-sm border p-4 transition-all ${
                isDisabled 
                  ? 'bg-gray-50 border-gray-300' 
                  : 'bg-white border-gray-200 hover:shadow-md'
              }`}
            >
                              <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`flex items-center ${isDisabled ? 'opacity-60' : ''}`}>
                      <h3 className="text-sm font-medium text-gray-900">
                        {deployment.workflow_name}
                      </h3>
                      <div className="flex items-center space-x-2">
                        {deployment.is_loaded && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                        {!isOpen && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Closed
                          </span>
                        )}
                      </div>
                    </div>
                  
                  <div className="mt-1 text-xs text-gray-500 space-y-1">
                    <div className={isDisabled ? 'opacity-60' : ''}>
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
                    {/* Individual Grade Display for Code Deployments - Always visible */}
                    {renderGradeDisplay(deployment)}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {/* Student action button - can be disabled */}
                  <div className={isDisabled ? 'opacity-60' : ''}>
                    {(()=>{ 
                      const depType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat'; 
                      const isCode = depType === 'code';
                      const isMCQ = depType === 'mcq';
                      return (
                      <button
                        onClick={()=> {
                          if (isDisabled) return; // Prevent action if disabled
                          if (isCode && onCodeWithDeployment) {
                            onCodeWithDeployment(deployment.deployment_id, deployment.workflow_name);
                          } else if (isMCQ && onMCQWithDeployment) {
                            onMCQWithDeployment(deployment.deployment_id, deployment.workflow_name);
                          } else {
                            onChatWithDeployment(deployment.deployment_id, deployment.workflow_name);
                          }
                        }}
                        disabled={isDisabled}
                        className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded ${
                          isDisabled 
                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                            : `text-white ${
                                isCode ? 'bg-purple-600 hover:bg-purple-700' :
                                isMCQ ? 'bg-green-600 hover:bg-green-700' :
                                'bg-blue-600 hover:bg-blue-700'
                              }`
                        }`}
                        title={isDisabled ? 'Deployment is closed' : (
                          isCode ? 'Solve this code challenge' :
                          isMCQ ? 'Take the multiple choice quiz' :
                          'Chat with this deployment'
                        )}
                      >
                        {isCode ? <RocketLaunchIcon className="h-3 w-3 mr-1"/> : 
                         isMCQ ? <ClipboardDocumentCheckIcon className="h-3 w-3 mr-1"/> :
                         <ChatBubbleLeftRightIcon className="h-3 w-3 mr-1"/>}
                        {isCode ? 'Code' : isMCQ ? 'Quiz' : 'Chat'}
                      </button>
                    );})()}
                  </div>
                  
                  {/* Instructor controls - always fully visible */}
                  {isInstructor && (
                    <>
                      <button
                        onClick={() => {
                          const depType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
                          if (depType === 'code' && onViewStudentSubmissions) {
                            onViewStudentSubmissions(deployment.deployment_id, deployment.workflow_name);
                          } else if (depType === 'mcq' && onViewStudentMCQ) {
                            onViewStudentMCQ(deployment.deployment_id, deployment.workflow_name);
                          } else {
                            onViewStudentChats(deployment.deployment_id);
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                        title={
                          deploymentTypes[deployment.deployment_id] === 'code' ? 'View student submissions' :
                          deploymentTypes[deployment.deployment_id] === 'mcq' ? 'View student quiz sessions' :
                          'View student conversations'
                        }
                      >
                        <UsersIcon className="h-3 w-3 mr-1" />
                        Students
                      </button>

                      <button
                        onClick={() => handleToggleDeploymentState(deployment.deployment_id)}
                        disabled={togglingStates[deployment.deployment_id]}
                        className={`p-1 rounded disabled:opacity-50 ${
                          deploymentStates[deployment.deployment_id] ?? true
                            ? 'text-green-600 hover:text-green-700 hover:bg-green-50' 
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                        title={(deploymentStates[deployment.deployment_id] ?? true) ? 'Close deployment' : 'Open deployment'}
                      >
                        {(deploymentStates[deployment.deployment_id] ?? true) ? (
                          <LockOpenIcon className="h-4 w-4" />
                        ) : (
                          <LockClosedIcon className="h-4 w-4" />
                        )}
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
            );
          })}
        </div>
      )}
    </div>
  );
} 
