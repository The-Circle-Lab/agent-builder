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
  LinkIcon,
  CogIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';
import { LivePresentationAdmin } from '../livePresentation/components/livePresentationAdmin';
import { BaseDeploymentAPI } from '@/lib/deploymentAPIs/deploymentAPI';

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
  group_id?: number;  // Add group_id for backend operations
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
  origin_type: string;
  origin: string;
  type: string;
  page: number;
  index: number;
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
    behavior_variables_only: boolean;
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

interface AvailableStudent {
  student_name: string;
  student_text: string;
}

interface AddMemberModalState {
  isOpen: boolean;
  assignmentId: number | null;
  groupId: number | null;
  groupName: string;
  availableStudents: AvailableStudent[];
  selectedStudent: string;
  loading: boolean;
  error: string | null;
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
  const [behaviorTasks, setBehaviorTasks] = useState<Map<string, string>>(new Map()); // behavior_number -> task_id
  const [taskStatus, setTaskStatus] = useState<Map<string, {progress: number, stage: string}>>(new Map()); // task_id -> status
  const [lastExecution, setLastExecution] = useState<{
    behavior_number?: string;
    success?: boolean;
    execution_time?: string;
    output_written_to_variable?: string;
    groups?: Record<string, string[]>;
    explanations?: Record<string, string>;
    themes?: ThemeInfo[];
    warning?: string;
    error?: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Pages lock management
  const [pages, setPages] = useState<Array<{page_number: number; deployment_id: string; deployment_type: string; has_chat: boolean; is_accessible: boolean; accessibility_reason?: string; is_locked?: boolean}>>([]);
  const [pagesAccessible, setPagesAccessible] = useState<number>(-1);
  const [pageLockBusy, setPageLockBusy] = useState<Record<number, boolean>>({});
  
  // Student button customization
  const [buttonCustomization, setButtonCustomization] = useState<{
    button_text: string;
    button_color: string;
  }>({
    button_text: 'Enter',
    button_color: 'bg-indigo-600 hover:bg-indigo-700'
  });
  const [savingButtonCustomization, setSavingButtonCustomization] = useState(false);
  
  // Due date management
  const [dueDate, setDueDate] = useState<{
    due_date: string | null;
    is_overdue: boolean;
    days_until_due: number | null;
  }>({
    due_date: null,
    is_overdue: false,
    days_until_due: null
  });
  const [savingDueDate, setSavingDueDate] = useState(false);
  // Local controlled input for datetime-local
  const [dueDateInput, setDueDateInput] = useState<string>('');

  // Rename deployment state
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Helper: format backend UTC ISO to datetime-local (local tz) string
  const formatDateTimeLocalInput = (isoString: string | null): string => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  
  const fetchPages = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/pages`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setPages(data.pages || []);
        setPagesAccessible(typeof data.pages_accessible === 'number' ? data.pages_accessible : -1);
      }
    } catch (e) {
      console.error('Error fetching pages list:', e);
    }
  };
  
  const fetchButtonCustomization = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/student-button`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setButtonCustomization(data);
      }
    } catch (e) {
      console.error('Error fetching button customization:', e);
    }
  };
  
  const saveButtonCustomization = async (buttonText: string, buttonColor: string) => {
    try {
      setSavingButtonCustomization(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/student-button`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          button_text: buttonText, 
          button_color: buttonColor 
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setButtonCustomization({
          button_text: data.button_text,
          button_color: data.button_color
        });
        alert('Button customization saved successfully!');
      } else {
        const error = await response.text();
        alert(`Failed to save button customization: ${error}`);
      }
    } catch (e) {
      console.error('Error saving button customization:', e);
      alert('Error saving button customization');
    } finally {
      setSavingButtonCustomization(false);
    }
  };
  
  const fetchDueDate = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/due-date`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setDueDate(data);
  setDueDateInput(formatDateTimeLocalInput(data?.due_date ?? null));
      }
    } catch (e) {
      console.error('Error fetching due date:', e);
    }
  };
  
  const saveDueDate = async (dueDateValue: string | null) => {
    try {
      setSavingDueDate(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/due-date`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          due_date: dueDateValue ? new Date(dueDateValue).toISOString() : null
        })
      });
      
      if (response.ok) {
        await fetchDueDate(); // Refresh due date info
        alert('Due date saved successfully!');
      } else {
        const error = await response.text();
        alert(`Failed to save due date: ${error}`);
      }
    } catch (e) {
      console.error('Error saving due date:', e);
      alert('Error saving due date');
    } finally {
      setSavingDueDate(false);
    }
  };
  const togglePageLock = async (pageNumber: number, lock: boolean) => {
    try {
      setPageLockBusy(prev => ({ ...prev, [pageNumber]: true }));
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/pages/${pageNumber}/lock`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: lock })
      });
      if (response.ok) {
        await fetchPages();
      } else {
        const txt = await response.text();
        console.error('Failed to toggle page lock:', txt);
      }
    } catch (e) {
      console.error('Error toggling page lock:', e);
    } finally {
      setPageLockBusy(prev => ({ ...prev, [pageNumber]: false }));
    }
  };

  // Rename deployment functions
  const openRenameModal = () => {
    setRenameValue(deploymentName);
    setRenameError(null);
    setIsRenameModalOpen(true);
  };

  const closeRenameModal = () => {
    setIsRenameModalOpen(false);
    setRenameValue('');
    setRenameError(null);
    setIsRenaming(false);
  };

  const handleRename = async () => {
    if (!renameValue.trim()) {
      setRenameError('Deployment name cannot be empty');
      return;
    }

    if (renameValue.trim() === deploymentName) {
      closeRenameModal();
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      await BaseDeploymentAPI.renameDeployment(deploymentId, renameValue.trim());
      
      // Update the deployment name in the parent component if needed
      // This would typically trigger a re-fetch or be handled by props
      closeRenameModal();
      
      // Optionally refresh the page or update the local state
      window.location.reload(); // Simple approach for now
    } catch (error) {
      console.error('Error renaming deployment:', error);
      setRenameError(error instanceof Error ? error.message : 'Failed to rename deployment');
    } finally {
      setIsRenaming(false);
    }
  };
  
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
  const [activeTab, setActiveTab] = useState<'completed' | 'in-progress'>('completed');
  
  // Live Presentation admin state
  const [livePresentationAdmin, setLivePresentationAdmin] = useState<{
    deploymentId: string;
    deploymentName: string;
    pageNumber: number;
  } | null>(null);

  // Add member modal state
  const [addMemberModal, setAddMemberModal] = useState<AddMemberModalState>({
    isOpen: false,
    assignmentId: null,
    groupId: null,
    groupName: '',
    availableStudents: [],
    selectedStudent: '',
    loading: false,
    error: null
  });

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
      console.log(`🔍 Fetching theme assignments for deployment: ${deploymentId}`);
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/theme-assignments`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(`🔍 Received theme assignments data:`, data);
        console.log(`🔍 Number of theme assignments: ${data.length}`);
        setThemeAssignments(data);
      } else {
        console.error('Failed to fetch theme assignments:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response body:', errorText);
      }
    } catch (error) {
      console.error('Error fetching theme assignments:', error);
    }
  };

  // Add member functions
  const openAddMemberModal = async (assignmentId: number, groupId: number, groupName: string) => {
    setAddMemberModal(prev => ({
      ...prev,
      isOpen: true,
      assignmentId,
      groupId,
      groupName,
      loading: true,
      error: null,
      selectedStudent: ''
    }));

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/group-assignments/${assignmentId}/available-students`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setAddMemberModal(prev => ({
          ...prev,
          availableStudents: data.students,
          loading: false
        }));
      } else {
        setAddMemberModal(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to fetch available students'
        }));
      }
    } catch (error) {
      console.error('Error fetching available students:', error);
      setAddMemberModal(prev => ({
        ...prev,
        loading: false,
        error: 'Error fetching available students'
      }));
    }
  };

  const closeAddMemberModal = () => {
    setAddMemberModal({
      isOpen: false,
      assignmentId: null,
      groupId: null,
      groupName: '',
      availableStudents: [],
      selectedStudent: '',
      loading: false,
      error: null
    });
  };

  const handleAddMember = async () => {
    if (!addMemberModal.selectedStudent || !addMemberModal.assignmentId) {
      return;
    }

    setAddMemberModal(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/group-assignments/${addMemberModal.assignmentId}/add-member`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            assignment_id: addMemberModal.assignmentId,
            student_name: addMemberModal.selectedStudent,
            student_text: '',
            target_group_id: addMemberModal.groupId
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Refresh group assignments to show the new member
          await fetchGroupAssignments();
          closeAddMemberModal();
        } else {
          setAddMemberModal(prev => ({
            ...prev,
            loading: false,
            error: result.error || 'Failed to add member'
          }));
        }
      } else {
        setAddMemberModal(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to add member to group'
        }));
      }
    } catch (error) {
      console.error('Error adding member to group:', error);
      setAddMemberModal(prev => ({
        ...prev,
        loading: false,
        error: 'Error adding member to group'
      }));
    }
  };

  // Poll task status for async behaviors
  const pollTaskStatus = async (taskId: string, behaviorNumber: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/behaviors/tasks/${taskId}`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const status = await response.json();
        
        // Update task status for progress tracking
        setTaskStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(taskId, {
            progress: status.progress || 0,
            stage: status.stage || 'unknown'
          });
          return newMap;
        });
        
        if (status.state === 'SUCCESS') {
          // Task completed successfully
          setLastExecution({
            behavior_number: behaviorNumber,
            success: true,
            execution_time: status.result?.execution_time,
            output_written_to_variable: status.result?.output_written_to_variable,
            groups: status.result?.groups,
            explanations: status.result?.explanations,
            themes: status.result?.themes,
            warning: status.result?.warning,
            error: status.result?.error
          });
          
          // If this was a theme creator behavior, refresh theme assignments
          if (status.result?.themes && Array.isArray(status.result.themes)) {
            fetchThemeAssignments();
          }
          
          // Refresh analytics to show updated variable states
          setRefreshKey(prev => prev + 1);
          
          // Remove from executing behaviors
          setExecutingBehavior(null);
          setBehaviorTasks(prev => {
            const newMap = new Map(prev);
            newMap.delete(behaviorNumber);
            return newMap;
          });
          setTaskStatus(prev => {
            const newMap = new Map(prev);
            newMap.delete(taskId);
            return newMap;
          });
          
          alert(`Behavior execution completed successfully!`);
        } else if (status.state === 'FAILURE') {
          // Task failed
          setLastExecution({
            behavior_number: behaviorNumber,
            success: false,
            error: status.error || 'Behavior execution failed'
          });
          
          setExecutingBehavior(null);
          setBehaviorTasks(prev => {
            const newMap = new Map(prev);
            newMap.delete(behaviorNumber);
            return newMap;
          });
          setTaskStatus(prev => {
            const newMap = new Map(prev);
            newMap.delete(taskId);
            return newMap;
          });
          
          alert(`Behavior execution failed: ${status.error || 'Unknown error'}`);
        } else {
          // Task still running, poll again
          setTimeout(() => pollTaskStatus(taskId, behaviorNumber), 2000);
        }
      } else {
        console.error('Failed to check task status');
        // Stop polling on error
        setExecutingBehavior(null);
        setBehaviorTasks(prev => {
          const newMap = new Map(prev);
          newMap.delete(behaviorNumber);
          return newMap;
        });
        setTaskStatus(prev => {
          const newMap = new Map(prev);
          const taskId = behaviorTasks.get(behaviorNumber);
          if (taskId) newMap.delete(taskId);
          return newMap;
        });
        alert('Failed to check task status');
      }
    } catch (error) {
      console.error('Error checking task status:', error);
      // Stop polling on error
      setExecutingBehavior(null);
      setBehaviorTasks(prev => {
        const newMap = new Map(prev);
        newMap.delete(behaviorNumber);
        return newMap;
      });
      setTaskStatus(prev => {
        const newMap = new Map(prev);
        if (taskId) newMap.delete(taskId);
        return newMap;
      });
      alert('Error checking task status');
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
        
        // Check if this is an async response (has task_id) or sync response (has success)
        if (result.task_id) {
          // Async execution - start polling for status
          setBehaviorTasks(prev => {
            const newMap = new Map(prev);
            newMap.set(behaviorNumber, result.task_id);
            return newMap;
          });
          
          // Start polling
          setTimeout(() => pollTaskStatus(result.task_id, behaviorNumber), 1000);
          
          alert(`Behavior execution started. Running in background...`);
        } else {
          // Synchronous execution - handle immediately
          setLastExecution(result);
          
          // If this was a theme creator behavior, refresh theme assignments
          if (result.success && result.themes && Array.isArray(result.themes)) {
            // This is a theme creator result
            setLastExecution(prev => ({ ...prev, themes: result.themes }));
            fetchThemeAssignments(); // Fetch from database
          }
          
          // Refresh analytics to show updated variable states
          setRefreshKey(prev => prev + 1);
          
          setExecutingBehavior(null);
          alert(`Behavior execution ${result.success ? 'completed successfully' : 'failed'}!`);
        }
      } else {
        const error = await response.text();
        setExecutingBehavior(null);
        alert(`Failed to execute behavior: ${error}`);
      }
    } catch (error) {
      console.error('Error executing behavior:', error);
      setExecutingBehavior(null);
      alert('Failed to execute behavior');
    }
  };

  // Cancel async behavior
  const cancelBehavior = async (behaviorNumber: string) => {
    const taskId = behaviorTasks.get(behaviorNumber);
    if (!taskId) return;
    
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/behaviors/tasks/${taskId}/cancel`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      
      if (response.ok) {
        setExecutingBehavior(null);
        setBehaviorTasks(prev => {
          const newMap = new Map(prev);
          newMap.delete(behaviorNumber);
          return newMap;
        });
        alert('Behavior execution cancelled');
      } else {
        alert('Failed to cancel behavior execution');
      }
    } catch (error) {
      console.error('Error cancelling behavior:', error);
      alert('Error cancelling behavior execution');
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
      setActiveTab('completed'); // Reset tab when opening modal
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
        setActiveTab('completed'); // Reset tab when opening modal
      } else {
        console.error('Failed to fetch page sessions');
        setSelectedPageStats({
          pageNumber,
          deploymentId: pageDeploymentId,
          deploymentType,
          sessions: [],
          selectedSession: null
        });
        setActiveTab('completed'); // Reset tab when opening modal
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
      setActiveTab('completed'); // Reset tab when opening modal
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
      await Promise.all([fetchAnalytics(), fetchBehaviors(), fetchGroupAssignments(), fetchThemeAssignments(), fetchPages(), fetchButtonCustomization(), fetchDueDate()]);
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
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-gray-900">{deploymentName}</h1>
                  <button
                    onClick={openRenameModal}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    title="Rename deployment"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                </div>
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
          {/* Page Operations */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <ChartBarIcon className="h-5 w-5 mr-2" />
                  Page Operations
                </h2>
                <div className="text-sm text-gray-500">
                  {pagesAccessible === -1 ? 'All pages accessible' : `${pagesAccessible} of ${pages.length} accessible`}
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {analytics.page_statistics.map((page) => {
                  // Find the corresponding page from pages array to get lock status
                  const pageInfo = pages.find(p => p.page_number === page.page_number);
                  
                  return (
                    <div 
                      key={page.page_number} 
                      className="border rounded-lg p-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                      onClick={(e) => {
                        // Don't trigger page navigation if clicking on lock/unlock buttons
                        if (e.target instanceof HTMLElement && (
                          e.target.closest('button') || 
                          e.target.tagName === 'BUTTON'
                        )) {
                          return;
                        }
                        // Use the actual page deployment ID from analytics
                        fetchPageSessions(page.page_number, page.page_deployment_id, page.deployment_type);
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-medium text-gray-900">
                            Page {page.page_number} ({page.deployment_type})
                          </h3>
                          <div className="flex items-center space-x-2">
                            {page.is_accessible ? (
                              <CheckCircleIcon className="h-5 w-5 text-green-500" title="Accessible" />
                            ) : (
                              <XCircleIcon className="h-5 w-5 text-red-500" title="Not accessible" />
                            )}
                            {pageInfo?.is_locked && (
                              <div className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded font-medium">
                                LOCKED
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Lock/Unlock Controls */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {pageInfo && !pageInfo.is_locked ? (
                            <button
                              onClick={() => togglePageLock(page.page_number, true)}
                              disabled={!!pageLockBusy[page.page_number]}
                              className={`px-3 py-1.5 rounded text-sm ${pageLockBusy[page.page_number] ? 'bg-orange-300 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                            >
                              {pageLockBusy[page.page_number] ? 'Locking…' : 'Lock'}
                            </button>
                          ) : pageInfo && pageInfo.is_locked ? (
                            <button
                              onClick={() => togglePageLock(page.page_number, false)}
                              disabled={!!pageLockBusy[page.page_number]}
                              className={`px-3 py-1.5 rounded text-sm ${pageLockBusy[page.page_number] ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                            >
                              {pageLockBusy[page.page_number] ? 'Unlocking…' : 'Unlock'}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {page.requires_variable && (
                        <div className="mb-3">
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
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-4 text-sm mb-3">
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
                        <div className="text-sm text-gray-500">
                          <ClockIcon className="h-4 w-4 inline mr-1" />
                          Avg time: {page.average_time_to_complete.toFixed(1)} minutes
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  Behavior Variables
                  {analytics.variable_summary.behavior_variables_only && (
                    <span className="ml-2 text-sm font-normal text-gray-500">(Behavior outputs only)</span>
                  )}
                </h2>
              </div>
              <div className="p-6">
                {analytics.variable_summary.variables.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">
                      <VariableIcon className="mx-auto h-12 w-12" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">No behavior variables yet</h3>
                    <p className="text-sm text-gray-500">
                      Variables will appear here after behaviors (groups, themes) are executed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analytics.variable_summary.variables.map((variable) => (
                    <div key={variable.name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">{variable.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            variable.origin === 'group' ? 'bg-blue-100 text-blue-800' :
                            variable.origin === 'theme' ? 'bg-purple-100 text-purple-800' :
                            variable.origin === 'live_presentation' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {variable.origin}
                          </span>
                          <span className="text-xs text-gray-500">
                            {variable.type} • Page {variable.page}
                          </span>
                        </div>
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
                )}
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
                        <div className="flex items-center space-x-2">
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
                                {behaviorTasks.has(behavior.behavior_number) ? 'Running...' : 'Executing...'}
                              </>
                            ) : (
                              <>
                                <PlayIcon className="h-4 w-4 mr-2" />
                                Execute
                              </>
                            )}
                          </button>
                          
                          {/* Cancel button for async behaviors */}
                          {executingBehavior === behavior.behavior_number && behaviorTasks.has(behavior.behavior_number) && (
                            <button
                              onClick={() => cancelBehavior(behavior.behavior_number)}
                              className="inline-flex items-center px-2 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                              title="Cancel execution"
                            >
                              <XCircleIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress indicator for async behaviors */}
                      {executingBehavior === behavior.behavior_number && behaviorTasks.has(behavior.behavior_number) && (
                        (() => {
                          const taskId = behaviorTasks.get(behavior.behavior_number);
                          const progress = taskId ? taskStatus.get(taskId) : null;
                          return progress ? (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-900">
                                  Progress: {progress.progress}%
                                </span>
                                <span className="text-xs text-blue-700">
                                  {progress.stage}
                                </span>
                              </div>
                              <div className="w-full bg-blue-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${progress.progress}%` }}
                                ></div>
                              </div>
                            </div>
                          ) : null;
                        })()
                      )}
                      
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

      {/* Student Button Customization */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <CogIcon className="h-5 w-5 mr-2" />
              Student Button Customization
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Customize how the Enter button appears for students
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Button Text Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Button Text
                </label>
                <select
                  value={buttonCustomization.button_text}
                  onChange={(e) => setButtonCustomization(prev => ({ ...prev, button_text: e.target.value }))}
                  className="text-black block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="Enter">Enter</option>
                  <option value="Homework">Homework</option>
                </select>
              </div>

              {/* Button Color Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Button Color
                </label>
                <select
                  value={buttonCustomization.button_color}
                  onChange={(e) => setButtonCustomization(prev => ({ ...prev, button_color: e.target.value }))}
                  className="text-black block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="bg-indigo-600 hover:bg-indigo-700">Indigo (Default)</option>
                  <option value="bg-blue-600 hover:bg-blue-700">Blue</option>
                  <option value="bg-green-600 hover:bg-green-700">Green</option>
                  <option value="bg-purple-600 hover:bg-purple-700">Purple</option>
                  <option value="bg-red-600 hover:bg-red-700">Red</option>
                  <option value="bg-orange-600 hover:bg-orange-700">Orange</option>
                  <option value="bg-yellow-600 hover:bg-yellow-700">Yellow</option>
                  <option value="bg-pink-600 hover:bg-pink-700">Pink</option>
                  <option value="bg-gray-600 hover:bg-gray-700">Gray</option>
                </select>
              </div>
            </div>

            {/* Preview and Save */}
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700">Preview:</span>
                <button
                  className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white ${buttonCustomization.button_color}`}
                  disabled
                >
                  <DocumentIcon className="h-3 w-3 mr-1"/>
                  {buttonCustomization.button_text}
                </button>
              </div>
              
              <button
                onClick={() => saveButtonCustomization(buttonCustomization.button_text, buttonCustomization.button_color)}
                disabled={savingButtonCustomization}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {savingButtonCustomization ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
        
        {/* Due Date Management */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <ClockIcon className="h-5 w-5 mr-2" />
              Due Date Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Set an optional due date for this deployment
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Due Date Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date
                </label>
                <input
                  type="datetime-local"
                  value={dueDateInput}
                  onChange={(e) => setDueDateInput(e.target.value)}
                  className="text-black block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty for no due date
                </p>
              </div>

              {/* Due Date Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <div className="space-y-2">
                  {dueDate.due_date ? (
                    <>
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        dueDate.is_overdue 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {dueDate.is_overdue ? 'Overdue' : 'Active'}
                      </div>
                      <p className="text-sm text-gray-600">
                        {dueDate.is_overdue 
                          ? `Overdue by ${dueDate.days_until_due} days`
                          : `Due in ${dueDate.days_until_due} days`
                        }
                      </p>
                      <p className="text-xs text-gray-500">
                        Due: {new Date(dueDate.due_date).toLocaleString(undefined, { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric', 
                          hour: 'numeric', 
                          minute: '2-digit'
                        })}
                      </p>
                    </>
                  ) : (
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                      No due date set
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save and Clear Buttons */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => { setDueDateInput(''); saveDueDate(null); }}
                disabled={savingDueDate || (!dueDate.due_date && !dueDateInput)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Clear Due Date
              </button>
              
              <button
                onClick={() => saveDueDate(dueDateInput || null)}
                disabled={savingDueDate}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {savingDueDate ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Due Date'
                )}
              </button>
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
                    <p className="text-sm text-gray-600">{selectedPageStats.sessions.length} students total</p>
                    
                    {/* Tabs */}
                    <div className="mt-3 flex space-x-1 bg-gray-100 p-1 rounded-lg">
                      {(() => {
                        const completedSessions = selectedPageStats.sessions.filter(s => s.is_completed);
                        const inProgressSessions = selectedPageStats.sessions.filter(s => !s.is_completed);
                        
                        return (
                          <>
                            <button
                              onClick={() => {
                                setActiveTab('completed');
                                setSelectedPageStats(prev => prev ? { ...prev, selectedSession: null } : null);
                              }}
                              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                                activeTab === 'completed'
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Completed ({completedSessions.length})
                            </button>
                            <button
                              onClick={() => {
                                setActiveTab('in-progress');
                                setSelectedPageStats(prev => prev ? { ...prev, selectedSession: null } : null);
                              }}
                              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                                activeTab === 'in-progress'
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              In Progress ({inProgressSessions.length})
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {loadingPageStats ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      </div>
                    ) : (() => {
                      const filteredSessions = selectedPageStats.sessions.filter(session => 
                        activeTab === 'completed' ? session.is_completed : !session.is_completed
                      );
                      
                      return filteredSessions.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                          <p>
                            {activeTab === 'completed' 
                              ? 'No completed sessions found' 
                              : 'No students in progress or not started'
                            }
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {filteredSessions.map((session) => (
                            <div
                              key={`${session.session_id}-${session.user_email}`}
                              onClick={() => {
                                // Only fetch submissions if the session exists (session_id > 0)
                                if (session.session_id > 0) {
                                  fetchPageSubmissions(session.session_id, selectedPageStats.deploymentId);
                                }
                              }}
                              className={`p-4 rounded-lg border transition-all ${
                                session.session_id === 0 
                                  ? 'border-gray-200 bg-gray-50 cursor-default' // Non-clickable for students who haven't started
                                  : selectedPageStats.selectedSession?.session_id === session.session_id
                                    ? 'border-indigo-200 bg-indigo-50 cursor-pointer'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-gray-900">
                                  {session.user_email}
                                </span>
                                <div className="flex items-center space-x-2">
                                  {session.is_completed && (
                                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                                  )}
                                  {!session.is_completed && session.submitted_count === 0 && (
                                    <div className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded font-medium">
                                      {session.session_id === 0 ? 'Not Started' : 'Not Started'}
                                    </div>
                                  )}
                                  {!session.is_completed && session.submitted_count > 0 && (
                                    <div className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded font-medium">
                                      In Progress
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="text-sm text-gray-600 space-y-1">
                                <div className="flex justify-between">
                                  <span>Progress:</span>
                                  <span className={`font-medium ${getProgressColor(session.progress_percentage)}`}>
                                    {session.submitted_count}/{session.total_submissions} ({Math.round(session.progress_percentage)}%)
                                  </span>
                                </div>
                                {session.session_id > 0 ? (
                                  <>
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
                                  </>
                                ) : (
                                  <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className="text-gray-500 italic">Has not accessed the prompt</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
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
                              const isListType = submission.media_type === 'list' || submission.media_type === 'dynamic_list';
                              
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
                                              : isListType
                                                ? 'bg-orange-100 text-orange-800'
                                                : 'bg-blue-100 text-blue-800'
                                        }`}>
                                          {isPdfType ? 'PDF' : isLinkType ? 'Link' : isListType ? 'List' : 'Text'}
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
                                        ) : isListType ? (
                                          (() => {
                                            const raw = submission.user_response ?? '';
                                            let items: string[] | null = null;
                                            try {
                                              const first = JSON.parse(raw);
                                              if (Array.isArray(first)) {
                                                items = first as string[];
                                              } else if (typeof first === 'string') {
                                                try {
                                                  const second = JSON.parse(first);
                                                  if (Array.isArray(second)) {
                                                    items = second as string[];
                                                  }
                                                } catch {
                                                  // ignore double-parse failure
                                                }
                                              }
                                            } catch {
                                              // ignore
                                            }

                                            if (!items) {
                                              const split = raw.split('\n').map(s => s.trim()).filter(Boolean);
                                              if (split.length > 0) items = split;
                                            }

                                            if (items && items.length > 0) {
                                              return (
                                                <div className="space-y-1">
                                                  {items.map((item: string, index: number) => (
                                                    <div key={index} className="flex items-start space-x-2">
                                                      <span className="text-gray-500 text-sm">{index + 1}.</span>
                                                      <span className="text-gray-800">{item}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              );
                                            }

                                            return (
                                              <p className="text-gray-800 whitespace-pre-wrap">
                                                {raw}
                                              </p>
                                            );
                                          })()
                                        ) : submission.media_type === 'websiteInfo' ? (
                                          (() => {
                                            try {
                                              const info = JSON.parse(submission.user_response);
                                              return (
                                                <div className="bg-gray-50 p-3 rounded space-y-2">
                                                  <div>
                                                    <span className="text-xs font-medium text-gray-600">URL:</span>
                                                    <a
                                                      href={info.url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="ml-2 text-blue-600 hover:text-blue-800 underline break-all text-sm"
                                                    >
                                                      {info.url}
                                                    </a>
                                                  </div>
                                                  <div>
                                                    <span className="text-xs font-medium text-gray-600">Name:</span>
                                                    <span className="ml-2 text-gray-800 text-sm">{info.name}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-xs font-medium text-gray-600 block mb-1">Purpose:</span>
                                                    <p className="text-gray-800 text-sm whitespace-pre-wrap pl-2">{info.purpose}</p>
                                                  </div>
                                                  <div>
                                                    <span className="text-xs font-medium text-gray-600 block mb-1">Platform:</span>
                                                    <p className="text-gray-800 text-sm whitespace-pre-wrap pl-2">{info.platform}</p>
                                                  </div>
                                                </div>
                                              );
                                            } catch {
                                              return <p className="text-gray-800">{submission.user_response}</p>;
                                            }
                                          })()
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
                        <p>
                          {activeTab === 'completed' 
                            ? 'Select a completed session to view submissions'
                            : 'Select a student with submissions to view details'
                          }
                        </p>
                        {activeTab === 'in-progress' && (
                          <p className="text-sm text-gray-400 mt-2">
                            Students who haven&apos;t started cannot be viewed yet
                          </p>
                        )}
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
                  
                  {lastExecution.explanations && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Group Explanations:</p>
                      <div className="grid grid-cols-1 gap-3 text-black">
                        {Object.entries(lastExecution.explanations).map(([groupName, explanation]) => (
                          <div key={groupName} className="bg-blue-50 rounded p-4 border border-blue-200">
                            <p className="font-medium text-sm text-blue-900 mb-2">{groupName}</p>
                            <p className="text-sm text-blue-800 leading-relaxed">
                              {explanation}
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
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-700">Members:</p>
                                <button
                                  onClick={() => openAddMemberModal(assignment.assignment_id, group.group_id || 0, group.group_name)}
                                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded transition-colors"
                                >
                                  + Add
                                </button>
                              </div>
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

      {/* Rename Deployment Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Rename Deployment</h3>
              <button
                onClick={closeRenameModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={isRenaming}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <label htmlFor="rename-input" className="block text-sm font-medium text-gray-700 mb-2">
                Deployment Name
              </label>
              <input
                id="rename-input"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="text-black w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter new deployment name"
                disabled={isRenaming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  } else if (e.key === 'Escape') {
                    closeRenameModal();
                  }
                }}
              />
              {renameError && (
                <p className="mt-2 text-sm text-red-600">{renameError}</p>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeRenameModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                disabled={isRenaming}
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isRenaming || !renameValue.trim()}
              >
                {isRenaming ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add Member to {addMemberModal.groupName}</h3>
              <button
                onClick={closeAddMemberModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={addMemberModal.loading}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {addMemberModal.loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-600">Loading available students...</span>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label htmlFor="student-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Student
                  </label>
                  {addMemberModal.availableStudents.length > 0 ? (
                    <select
                      id="student-select"
                      value={addMemberModal.selectedStudent}
                      onChange={(e) => setAddMemberModal(prev => ({ ...prev, selectedStudent: e.target.value }))}
                      className="text-black w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={addMemberModal.loading}
                    >
                      <option value="">Choose a student...</option>
                      {addMemberModal.availableStudents.map((student) => (
                        <option key={student.student_name} value={student.student_name}>
                          {student.student_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-500 py-2">No available students to add to this group.</p>
                  )}
                  {addMemberModal.error && (
                    <p className="mt-2 text-sm text-red-600">{addMemberModal.error}</p>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={closeAddMemberModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                    disabled={addMemberModal.loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddMember}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={addMemberModal.loading || !addMemberModal.selectedStudent || addMemberModal.availableStudents.length === 0}
                  >
                    {addMemberModal.loading ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
} 
