"use client";

import React, { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  UsersIcon, 
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentIcon,
  VariableIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowLeftIcon,
  PencilSquareIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';
import { LivePresentationAdmin } from '../livePresentation/components/livePresentationAdmin';

// =============================================================================
// TYPES
// =============================================================================
interface PageStatistics {
  page_number: number;
  page_deployment_id: string;  // Add the actual deployment ID for this page
  deployment_type: string;
  total_students_started: number;
  total_students_completed: number;
  completion_rate: number;
  average_time_to_complete?: number;
  requires_variable: boolean;
  variable_name?: string;
  variable_populated: boolean;
  is_accessible: boolean;
  last_activity?: string;
}

interface GroupMemberInfo {
  student_name: string;
  student_text?: string;
}

interface GroupInfo {
  group_name: string;
  group_number: number;
  explanation?: string;
  members: GroupMemberInfo[];
  member_count: number;
}

interface GroupAssignmentInfo {
  assignment_id: number;
  execution_id: string;
  total_students: number;
  total_groups: number;
  group_size_target: number;
  grouping_method: string;
  includes_explanations: boolean;
  created_at: string;
  groups: GroupInfo[];
}

interface ThemeInfo {
  title: string;
  description: string;
  keywords: string[];
  snippets: string[];
  document_count: number;
  cluster_id: number;
}

interface ThemeAssignmentInfo {
  assignment_id: number;
  execution_id: string;
  total_students: number;
  total_themes: number;
  num_themes_target: number;
  clustering_method?: string;
  created_at: string;
  themes: ThemeInfo[];
}

interface BehaviorExecutionHistory {
  execution_id: string;
  behavior_number: string;
  behavior_type: string;
  executed_at: string;
  executed_by: string;
  success: boolean;
  input_student_count: number;
  output_groups_created?: number;
  output_themes_created?: number;
  variable_written?: string;
  execution_time: string;
  error_message?: string;
}

interface VariableInfo {
  name: string;
  type: string;
  is_empty: boolean;
  has_value: boolean;
  value_type?: string;
  value_preview?: string;
}

interface DeploymentAnalytics {
  deployment_id: string;
  total_pages: number;
  total_behaviors: number;
  total_variables: number;
  active_students: number;
  page_statistics: PageStatistics[];
  variable_summary: {
    total_variables: number;
    variables: VariableInfo[];
  };
  behavior_history: BehaviorExecutionHistory[];
  last_updated: string;
}

interface BehaviorInfo {
  behavior_number: string;
  behavior_type: string;
  has_input: boolean;
  input_type?: string;
  input_id?: string;
  has_output: boolean;
  output_type?: string;
  output_id?: string;
  config: Record<string, unknown>;
  can_execute: boolean;
}

interface PageSessionView {
  session_id: number;
  user_email: string;
  started_at: string;
  completed_at?: string;
  total_submissions: number;
  submitted_count: number;
  is_completed: boolean;
  progress_percentage: number;
}

interface PageSubmissionView {
  session_id: number;
  user_email: string;
  submissions: Array<{
    submission_index: number;
    prompt_text: string;
    media_type: string;
    user_response: string;
    submitted_at: string;
    document_id?: string | number;
    document_filename?: string;
  }>;
  completed_at?: string;
}

interface PageDeploymentAdminProps {
  deploymentId: string;
  deploymentName: string;
  onBack: () => void;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function PageDeploymentAdmin({ 
  deploymentId, 
  deploymentName, 
  onBack 
}: PageDeploymentAdminProps) {
  
  const [analytics, setAnalytics] = useState<DeploymentAnalytics | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorInfo[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<GroupAssignmentInfo[]>([]);
  const [themeAssignments, setThemeAssignments] = useState<ThemeAssignmentInfo[]>([]);
  

  const [loading, setLoading] = useState(true);
  const [executingBehavior, setExecutingBehavior] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<{
    behavior_number?: string;
    success?: boolean;
    execution_time?: string;
    output_written_to_variable?: string;
    groups?: Record<string, string[]>;
    themes?: ThemeInfo[];
    warning?: string;
    error?: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Page detail states
  const [selectedPageStats, setSelectedPageStats] = useState<{
    pageNumber: number;
    deploymentId: string;
    deploymentType: string;
    sessions: PageSessionView[];
    selectedSession: PageSubmissionView | null;
  } | null>(null);
  const [loadingPageStats, setLoadingPageStats] = useState(false);
  const [loadingPageSubmissions, setLoadingPageSubmissions] = useState(false);
  
  // Live Presentation admin state
  const [livePresentationAdmin, setLivePresentationAdmin] = useState<{
    deploymentId: string;
    deploymentName: string;
    pageNumber: number;
  } | null>(null);

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/analytics`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      } else {
        console.error('Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  // Fetch behaviors data
  const fetchBehaviors = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/behaviors`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setBehaviors(data);
      } else {
        console.error('Failed to fetch behaviors');
      }
    } catch (error) {
      console.error('Error fetching behaviors:', error);
    }
  };

  // Fetch group assignments data
  const fetchGroupAssignments = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/group-assignments`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setGroupAssignments(data);
      } else {
        console.error('Failed to fetch group assignments');
      }
    } catch (error) {
      console.error('Error fetching group assignments:', error);
    }
  };

  // Fetch theme assignments data
  const fetchThemeAssignments = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/theme-assignments`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setThemeAssignments(data);
      } else {
        console.error('Failed to fetch theme assignments:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching theme assignments:', error);
    }
  };

  // Execute behavior
  const executeBehavior = async (behaviorNumber: string) => {
    try {
      setExecutingBehavior(behaviorNumber);
      
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/behaviors/trigger`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ behavior_number: behaviorNumber })
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        setLastExecution(result);
        
        // If this was a theme creator behavior, refresh theme assignments
        if (result.success && result.themes && Array.isArray(result.themes)) {
          // This is a theme creator result
          setLastExecution(prev => ({ ...prev, themes: result.themes }));
          fetchThemeAssignments(); // Fetch from database
        }
        
        // Refresh analytics to show updated variable states
        setRefreshKey(prev => prev + 1);
        
        alert(`Behavior execution ${result.success ? 'completed successfully' : 'failed'}!`);
      } else {
        const error = await response.text();
        alert(`Failed to execute behavior: ${error}`);
      }
    } catch (error) {
      console.error('Error executing behavior:', error);
      alert('Failed to execute behavior');
    } finally {
      setExecutingBehavior(null);
    }
  };

  // Page detail functions
  const fetchPageSessions = async (pageNumber: number, pageDeploymentId: string, deploymentType: string) => {
    // Handle Live Presentation pages
    if (deploymentType === 'livePresentation') {
      setLivePresentationAdmin({
        deploymentId: pageDeploymentId,
        deploymentName: `${deploymentName} - Page ${pageNumber}`,
        pageNumber
      });
      return;
    }
    
    if (deploymentType !== 'prompt') {
      // For non-prompt pages, show a message
      setSelectedPageStats({
        pageNumber,
        deploymentId: pageDeploymentId,
        deploymentType,
        sessions: [],
        selectedSession: null
      });
      return;
    }

    try {
      setLoadingPageStats(true);
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${pageDeploymentId}/prompt/instructor/sessions`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const sessions = await response.json();
        setSelectedPageStats({
          pageNumber,
          deploymentId: pageDeploymentId,
          deploymentType,
          sessions,
          selectedSession: null
        });
      } else {
        console.error('Failed to fetch page sessions');
        setSelectedPageStats({
          pageNumber,
          deploymentId: pageDeploymentId,
          deploymentType,
          sessions: [],
          selectedSession: null
        });
      }
    } catch (error) {
      console.error('Error fetching page sessions:', error);
      setSelectedPageStats({
        pageNumber,
        deploymentId: pageDeploymentId,
        deploymentType,
        sessions: [],
        selectedSession: null
      });
    } finally {
      setLoadingPageStats(false);
    }
  };

  const fetchPageSubmissions = async (sessionId: number, pageDeploymentId: string) => {
    try {
      setLoadingPageSubmissions(true);
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${pageDeploymentId}/prompt/instructor/submissions/${sessionId}`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const submissionData = await response.json();
        setSelectedPageStats(prev => prev ? {
          ...prev,
          selectedSession: submissionData
        } : null);
      } else {
        console.error('Failed to fetch page submissions');
      }
    } catch (error) {
      console.error('Error fetching page submissions:', error);
    } finally {
      setLoadingPageSubmissions(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Load data on mount and when refresh key changes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAnalytics(), fetchBehaviors(), fetchGroupAssignments(), fetchThemeAssignments()]);
      setLoading(false);
    };
    
    loadData();
  }, [deploymentId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps



  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading deployment analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-500 mx-auto" />
          <p className="mt-2 text-gray-600">Failed to load deployment analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={onBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{deploymentName}</h1>
                <p className="text-sm text-gray-500">Instructor Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setRefreshKey(prev => prev + 1)}
                className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-900"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <DocumentIcon className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Pages</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.total_pages}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <UsersIcon className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Students</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.active_students}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <VariableIcon className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Variables</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.total_variables}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <BoltIcon className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Behaviors</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.total_behaviors}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Page Statistics */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center">
                <ChartBarIcon className="h-5 w-5 mr-2" />
                Page Statistics
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {analytics.page_statistics.map((page) => (
                  <div 
                    key={page.page_number} 
                    className="border rounded-lg p-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                    onClick={() => {
                      // Use the actual page deployment ID from analytics
                      fetchPageSessions(page.page_number, page.page_deployment_id, page.deployment_type);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">
                        Page {page.page_number} ({page.deployment_type})
                      </h3>
                      <div className="flex items-center space-x-2">
                        {page.is_accessible ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500" title="Accessible" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-red-500" title="Not accessible" />
                        )}
                        {page.requires_variable && (
                          <div className="flex items-center">
                            <VariableIcon className="h-4 w-4 text-purple-500 mr-1" />
                            <span className={`text-xs px-2 py-1 rounded ${
                              page.variable_populated 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {page.variable_name}: {page.variable_populated ? 'Ready' : 'Empty'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Started</p>
                        <p className="font-medium text-black">{page.total_students_started}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Completed</p>
                        <p className="font-medium text-black">{page.total_students_completed}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Completion Rate</p>
                        <p className="font-medium text-black">{page.completion_rate.toFixed(1)}%</p>
                      </div>
                    </div>
                    
                    {page.average_time_to_complete && (
                      <div className="mt-2 text-sm text-gray-500">
                        <ClockIcon className="h-4 w-4 inline mr-1" />
                        Avg time: {page.average_time_to_complete.toFixed(1)} minutes
                      </div>
                    )}
                    
                    <div className="mt-2 text-xs text-indigo-600">
                      {page.deployment_type === 'livePresentation' 
                        ? 'Click to open Live Presentation Admin →'
                        : 'Click to view detailed statistics →'
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Variables & Behaviors */}
          <div className="space-y-6">
            {/* Variables Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <VariableIcon className="h-5 w-5 mr-2" />
                  Variables Status
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {analytics.variable_summary.variables.map((variable) => (
                    <div key={variable.name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">{variable.name}</h4>
                        <p className="text-sm text-gray-500">Type: {variable.type}</p>
                        {variable.value_preview && (
                          <p className="text-xs text-gray-400 mt-1">{variable.value_preview}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          variable.has_value 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {variable.has_value ? 'Populated' : 'Empty'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Behaviors Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <BoltIcon className="h-5 w-5 mr-2" />
                  Behavior Controls
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {behaviors.map((behavior) => (
                    <div key={behavior.behavior_number} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            Behavior {behavior.behavior_number} ({behavior.behavior_type})
                          </h4>
                          <div className="text-sm text-gray-500 space-y-1">
                            {behavior.has_input && (
                              <p>Input: {behavior.input_type}:{behavior.input_id}</p>
                            )}
                            {behavior.has_output && (
                              <p>Output: {behavior.output_type}:{behavior.output_id}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => executeBehavior(behavior.behavior_number)}
                          disabled={!behavior.can_execute || executingBehavior === behavior.behavior_number}
                          className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${
                            behavior.can_execute && executingBehavior !== behavior.behavior_number
                              ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                              : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                          }`}
                        >
                          {executingBehavior === behavior.behavior_number ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Executing...
                            </>
                          ) : (
                            <>
                              <PlayIcon className="h-4 w-4 mr-2" />
                              Execute
                            </>
                          )}
                        </button>
                      </div>
                      
                      {behavior.config && (
                        <div className="text-xs text-gray-400 mt-2">
                          Config: {JSON.stringify(behavior.config, null, 2).substring(0, 100)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Page Detail Modal */}
      {selectedPageStats && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center">
                <DocumentIcon className="h-6 w-6 text-indigo-600 mr-3" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Page {selectedPageStats.pageNumber} Statistics
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selectedPageStats.deploymentType} deployment
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPageStats(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>

            {selectedPageStats.deploymentType !== 'prompt' ? (
              // Non-prompt deployment message
              <div className="p-8 text-center">
                <DocumentIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {selectedPageStats.deploymentType.charAt(0).toUpperCase() + selectedPageStats.deploymentType.slice(1)} Deployment
                </h3>
                <p className="text-gray-600">
                  Detailed statistics are currently only available for prompt-based pages.
                </p>
              </div>
            ) : (
              <div className="flex h-[calc(90vh-80px)]">
                {/* Sessions List */}
                <div className="w-1/2 border-r border-gray-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-medium text-gray-900">Student Sessions</h3>
                    <p className="text-sm text-gray-600">{selectedPageStats.sessions.length} students</p>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {loadingPageStats ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      </div>
                    ) : selectedPageStats.sessions.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <p>No student sessions found</p>
                      </div>
                    ) : (
                      <div className="p-4 space-y-3">
                        {selectedPageStats.sessions.map((session) => (
                          <div
                            key={session.session_id}
                            onClick={() => fetchPageSubmissions(session.session_id, selectedPageStats.deploymentId)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                              selectedPageStats.selectedSession?.session_id === session.session_id
                                ? 'border-indigo-200 bg-indigo-50'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                {session.user_email}
                              </span>
                              {session.is_completed && (
                                <CheckCircleIcon className="h-5 w-5 text-green-600" />
                              )}
                            </div>
                            
                            <div className="text-sm text-gray-600 space-y-1">
                              <div className="flex justify-between">
                                <span>Progress:</span>
                                <span className={`font-medium ${getProgressColor(session.progress_percentage)}`}>
                                  {session.submitted_count}/{session.total_submissions} ({Math.round(session.progress_percentage)}%)
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Started:</span>
                                <span>{formatDate(session.started_at)}</span>
                              </div>
                              {session.completed_at && (
                                <div className="flex justify-between">
                                  <span>Completed:</span>
                                  <span>{formatDate(session.completed_at)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Submissions Detail */}
                <div className="w-1/2 overflow-hidden flex flex-col">
                  {selectedPageStats.selectedSession ? (
                    <>
                      <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-medium text-gray-900">Submissions</h3>
                        <p className="text-sm text-gray-600">{selectedPageStats.selectedSession.user_email}</p>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4">
                        {loadingPageSubmissions ? (
                          <div className="flex items-center justify-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                          </div>
                        ) : selectedPageStats.selectedSession.submissions.length === 0 ? (
                          <div className="text-center text-gray-500 mt-8">
                            <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                            <p>No submissions yet</p>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {selectedPageStats.selectedSession.submissions.map((submission, index) => {
                              const isLinkType = submission.media_type === 'hyperlink';
                              const isPdfType = submission.media_type === 'pdf';
                              
                              return (
                                <div key={index} className="border border-gray-200 rounded-lg p-4">
                                  <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0 mt-1">
                                      {isPdfType ? (
                                        <DocumentIcon className="h-5 w-5 text-red-600" />
                                      ) : isLinkType ? (
                                        <LinkIcon className="h-5 w-5 text-purple-600" />
                                      ) : (
                                        <PencilSquareIcon className="h-5 w-5 text-blue-600" />
                                      )}
                                    </div>
                                    
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-medium text-gray-900">
                                          Requirement {submission.submission_index + 1}
                                        </h4>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                          isPdfType
                                            ? 'bg-red-100 text-red-800'
                                            : isLinkType 
                                              ? 'bg-purple-100 text-purple-800' 
                                              : 'bg-blue-100 text-blue-800'
                                        }`}>
                                          {isPdfType ? 'PDF' : isLinkType ? 'Link' : 'Text'}
                                        </span>
                                      </div>
                                      
                                      <p className="text-sm text-gray-600 mb-3">
                                        {submission.prompt_text}
                                      </p>
                                      
                                      <div className="p-3 bg-gray-50 rounded border">
                                        <p className="text-xs text-gray-500 mb-1">Student Response:</p>
                                        {isPdfType ? (
                                          <div className="flex items-center space-x-3">
                                            <a
                                              href={`${API_CONFIG.BASE_URL}/api/files/view/${submission.document_id || submission.user_response}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 underline break-all"
                                            >
                                              {submission.document_filename || `Document #${submission.document_id || submission.user_response}`}
                                            </a>
                                            <a
                                              href={`${API_CONFIG.BASE_URL}/api/files/download/${submission.document_id || submission.user_response}`}
                                              className="text-xs text-indigo-600 hover:text-indigo-800"
                                            >
                                              Download
                                            </a>
                                          </div>
                                        ) : isLinkType ? (
                                          <a
                                            href={submission.user_response}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 underline break-all"
                                          >
                                            {submission.user_response}
                                          </a>
                                        ) : (
                                          <p className="text-gray-800 whitespace-pre-wrap">
                                            {submission.user_response}
                                          </p>
                                        )}
                                      </div>
                                      
                                      <p className="text-xs text-gray-500 mt-2">
                                        Submitted: {formatDate(submission.submitted_at)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <p>Select a student session to view submissions</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

        {/* Last Execution Results & Group Assignments */}
        {(lastExecution || groupAssignments.length > 0) && (
          <div className="mt-8 space-y-6">
            {/* Last Execution Results */}
            {lastExecution && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center">
                    <InformationCircleIcon className="h-5 w-5 mr-2" />
                    Last Execution Result
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Behavior</p>
                      <p className="font-medium text-black">{lastExecution.behavior_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        lastExecution.success 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {lastExecution.success ? 'Success' : 'Failed'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Execution Time</p>
                      <p className="font-medium text-black">{lastExecution.execution_time}</p>
                    </div>
                    {lastExecution.output_written_to_variable && (
                      <div>
                        <p className="text-sm text-gray-500">Variable Updated</p>
                        <p className="font-medium text-black">{lastExecution.output_written_to_variable}</p>
                      </div>
                    )}
                  </div>
                  
                  {lastExecution.groups && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Groups Created:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-black">
                        {Object.entries(lastExecution.groups).map(([groupName, members]) => (
                          <div key={groupName} className="bg-gray-50 rounded p-3">
                            <p className="font-medium text-sm">{groupName}</p>
                            <p className="text-xs text-gray-600">
                              {Array.isArray(members) ? members.join(', ') : String(members)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {lastExecution.themes && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Themes Created:</p>
                      <div className="grid grid-cols-1 gap-4 text-black">
                        {lastExecution.themes.map((theme, index) => (
                          <div key={index} className="bg-gray-50 rounded p-4 border">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-medium text-sm text-gray-900">{theme.title}</h4>
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {theme.document_count} docs
                              </span>
                            </div>
                            
                            {theme.description && (
                              <p className="text-xs text-gray-700 mb-2">{theme.description}</p>
                            )}
                            
                            <div className="mb-2">
                              <p className="text-xs font-medium text-gray-600 mb-1">Keywords:</p>
                              <div className="flex flex-wrap gap-1">
                                {theme.keywords.slice(0, 5).map((keyword, idx) => (
                                  <span key={idx} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                            
                            {theme.snippets.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Sample:</p>
                                <p className="text-xs text-gray-600 italic">&ldquo;{theme.snippets[0]}&rdquo;</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {lastExecution.warning && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800">{lastExecution.warning}</p>
                    </div>
                  )}
                  
                  {lastExecution.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm text-red-800">{lastExecution.error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Group Assignments */}
            {groupAssignments.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center">
                    <UsersIcon className="h-5 w-5 mr-2" />
                    Group Assignments ({groupAssignments.length})
                  </h2>
                </div>
                <div className="p-6 space-y-6">
                  {groupAssignments.map((assignment, index) => (
                    <div key={assignment.assignment_id} className="border border-gray-200 rounded-lg p-4">
                      {/* Assignment Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">
                            Assignment #{assignment.assignment_id}
                            {index === 0 && (
                              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Latest
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Created: {formatDate(assignment.created_at)} | Method: {assignment.grouping_method} | Target size: {assignment.group_size_target}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{assignment.total_groups} Groups</p>
                          <p className="text-sm text-gray-500">{assignment.total_students} Students</p>
                        </div>
                      </div>

                      {/* Groups Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {assignment.groups.map((group) => (
                          <div key={group.group_name} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{group.group_name}</h4>
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                                {group.member_count} members
                              </span>
                            </div>
                            
                            {/* Group Explanation */}
                            {group.explanation && (
                              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                                <p className="text-xs font-medium text-blue-800 mb-1">Group Rationale:</p>
                                <p className="text-sm text-blue-900">{group.explanation}</p>
                              </div>
                            )}
                            
                            {/* Group Members */}
                            <div>
                              <p className="text-xs font-medium text-gray-700 mb-2">Members:</p>
                              <div className="space-y-2">
                                {group.members.map((member, memberIndex) => (
                                  <div key={memberIndex} className="text-xs text-gray-600">
                                    <p className="font-medium text-gray-900">{member.student_name}</p>
                                    {member.student_text && (
                                      <p className="text-gray-600 mt-1 whitespace-pre-wrap">
                                        &ldquo;{member.student_text}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Theme Assignments - Moved outside conditional */}
        <div className="mt-8 space-y-6">
            {/* Theme Assignments */}
            {themeAssignments.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      Theme Analysis
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-normal text-gray-500">
                        {themeAssignments.length} analysis{themeAssignments.length !== 1 ? 'es' : ''} found
                      </span>
                      <button
                        onClick={fetchThemeAssignments}
                        className="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-900 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                        title="Refresh theme assignments"
                      >
                        Refresh
                      </button>
                    </div>
                  </h2>
                  {themeAssignments.length > 1 && (
                    <p className="text-sm text-gray-600 mt-1">
                      Multiple theme analyses are available. Each analysis represents a different execution of theme creation behaviors.
                    </p>
                  )}
                </div>
                <div className="p-6 space-y-6">
                  {themeAssignments.map((assignment, index) => {
                    // Use different border colors to visually distinguish multiple analyses
                    const borderColor = index === 0 
                      ? 'border-blue-200 bg-blue-50' 
                      : index === 1 
                        ? 'border-green-200 bg-green-50'
                        : 'border-purple-200 bg-purple-50';
                    
                    return (
                      <div key={assignment.assignment_id} className={`border-2 rounded-lg p-4 ${borderColor}`}>
                        {/* Assignment Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              Theme Analysis #{assignment.assignment_id}
                              {index === 0 && (
                                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Latest
                                </span>
                              )}
                              {index === 1 && (
                                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Previous
                                </span>
                              )}
                              {index > 1 && (
                                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  Historical
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Created: {formatDate(assignment.created_at)} | Target themes: {assignment.num_themes_target}
                            </p>
                            <p className="text-xs text-gray-500">
                              Execution ID: {assignment.execution_id} | Method: {assignment.clustering_method || 'Unknown'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">{assignment.total_themes} Themes</p>
                            <p className="text-sm text-gray-500">{assignment.total_students} Students</p>
                          </div>
                        </div>

                        {/* Themes Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {assignment.themes.map((theme) => (
                            <div key={theme.cluster_id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium text-gray-900 text-sm">{theme.title}</h4>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  {theme.document_count} docs
                                </span>
                              </div>
                              
                              {/* Theme Description */}
                              {theme.description && (
                                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                                  <p className="text-xs text-blue-900">{theme.description}</p>
                                </div>
                              )}
                              
                              {/* Keywords */}
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-700 mb-1">Keywords:</p>
                                <div className="flex flex-wrap gap-1">
                                  {theme.keywords.slice(0, 4).map((keyword, keywordIndex) => (
                                    <span key={keywordIndex} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                                      {keyword}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Sample Snippet */}
                              {theme.snippets.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-gray-700 mb-1">Sample:</p>
                                  <div className="text-xs text-gray-600 italic bg-white p-2 rounded border">
                                    &ldquo;{theme.snippets[0].substring(0, 100)}...&rdquo;
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </div>

      {/* Live Presentation Admin Modal */}
      {livePresentationAdmin && (
        <LivePresentationAdmin
          deploymentId={livePresentationAdmin.deploymentId}
          deploymentName={livePresentationAdmin.deploymentName}
          onClose={() => setLivePresentationAdmin(null)}
        />
      )}
      </div>
    </div>
  );
} 
