"use client";

import React, { useState, useEffect } from 'react';
import { Deployment } from '@/lib/types';
import { BaseDeploymentAPI } from '../../../lib/deploymentAPIs/deploymentAPI';
import { 
  ChatBubbleLeftRightIcon, 
  TrashIcon, 
  RocketLaunchIcon,
  AcademicCapIcon,
  LockClosedIcon,
  LockOpenIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  DocumentIcon,
  CogIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';

// =============================================================================
// DEPLOYMENT TYPE CONFIGURATION
// =============================================================================
// To add a new deployment type, simply add an entry here with the required properties
const DEPLOYMENT_TYPES = {
  chat: {
    name: 'chat',
    displayName: 'Chat',
    buttonText: 'Chat',
    buttonColor: 'bg-blue-600 hover:bg-blue-700',
    icon: ChatBubbleLeftRightIcon,
    hasGrading: false,
    studentViewLabel: 'View student conversations',
    handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      props.onChatWithDeployment(deployment.deployment_id, deployment.workflow_name);
    },
    handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      props.onViewStudentChats(deployment.deployment_id);
    }
  },
  code: {
    name: 'code',
    displayName: 'Code Challenge',
    buttonText: 'Code',
    buttonColor: 'bg-purple-600 hover:bg-purple-700',
    icon: RocketLaunchIcon,
    hasGrading: true,
    studentViewLabel: 'View student submissions',
    handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onCodeWithDeployment) {
        props.onCodeWithDeployment(deployment.deployment_id, deployment.workflow_name);
      }
    },
    handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onViewStudentSubmissions) {
        props.onViewStudentSubmissions(deployment.deployment_id, deployment.workflow_name);
      }
    }
  },
  mcq: {
    name: 'mcq',
    displayName: 'Multiple Choice Quiz',
    buttonText: 'Quiz',
    buttonColor: 'bg-green-600 hover:bg-green-700',
    icon: ClipboardDocumentCheckIcon,
    hasGrading: true,
    studentViewLabel: 'View student quiz sessions',
    handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onMCQWithDeployment) {
        props.onMCQWithDeployment(deployment.deployment_id, deployment.workflow_name);
      }
    },
    handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onViewStudentMCQ) {
        props.onViewStudentMCQ(deployment.deployment_id, deployment.workflow_name);
      }
    }
  },
  prompt: {
    name: 'prompt',
    displayName: 'Prompt Response',
    buttonText: 'Respond',
    buttonColor: 'bg-orange-600 hover:bg-orange-700',
    icon: PencilSquareIcon,
    hasGrading: false,
    studentViewLabel: 'View student responses',
    handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onPromptWithDeployment) {
        props.onPromptWithDeployment(deployment.deployment_id, deployment.workflow_name);
      }
    },
    handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onViewStudentPrompts) {
        props.onViewStudentPrompts(deployment.deployment_id, deployment.workflow_name);
      }
    }
  },
  page: {
    name: 'page',
    displayName: 'Multi-Page Workflow',
    buttonText: 'Enter',
    buttonColor: 'bg-indigo-600 hover:bg-indigo-700',
    icon: DocumentIcon,
    hasGrading: true, // Pages can contain different types including graded ones
    studentViewLabel: 'View student page interactions',
    handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onPageWithDeployment) {
        props.onPageWithDeployment(deployment.deployment_id, deployment.workflow_name);
      }
    },
    handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onViewStudentPages) {
        props.onViewStudentPages(deployment.deployment_id, deployment.workflow_name);
      }
    },
    // Instructor-specific overrides
    instructorButtonText: 'Activity',
    instructorIcon: CogIcon,
    instructorButtonColor: 'bg-purple-600 hover:bg-purple-700',
    handleInstructorAction: (props: ClassDeploymentsProps, deployment: Deployment) => {
      if (props.onAdminPageDeployment) {
        props.onAdminPageDeployment(deployment.deployment_id, deployment.workflow_name);
      }
    }
  }
  // Add new deployment types here following the same pattern
  // Example:
  // newType: {
  //   name: 'newType',
  //   displayName: 'New Type',
  //   buttonText: 'Start',
  //   buttonColor: 'bg-indigo-600 hover:bg-indigo-700',
  //   icon: SomeHeroIcon,
  //   hasGrading: false,
  //   studentViewLabel: 'View student sessions',
  //   handleDeploymentAction: (props: any, deployment: any) => {
  //     if (props.onNewTypeWithDeployment) {
  //       props.onNewTypeWithDeployment(deployment.deployment_id, deployment.workflow_name);
  //     }
  //   },
  //   handleStudentViewAction: (props: any, deployment: any) => {
  //     props.onViewStudentChats(deployment.deployment_id); // or custom logic
  //   }
  // }
};

// =============================================================================
// TYPES
// =============================================================================
interface DeploymentTypeConfig {
  name: string;
  displayName: string;
  buttonText: string;
  buttonColor: string;
  icon: React.ComponentType<{ className?: string }>;
  hasGrading: boolean;
  studentViewLabel: string;
  handleDeploymentAction: (props: ClassDeploymentsProps, deployment: Deployment) => void;
  handleStudentViewAction: (props: ClassDeploymentsProps, deployment: Deployment) => void;
  // Optional instructor-specific overrides
  instructorButtonText?: string;
  instructorIcon?: React.ComponentType<{ className?: string }>;
  instructorButtonColor?: string;
  handleInstructorAction?: (props: ClassDeploymentsProps, deployment: Deployment) => void;
}

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

type PageProgressStatus = 'not_started' | 'in_progress' | 'completed';

interface PageProgressData {
  deployment_id: string;
  status: PageProgressStatus;
  required_pages: number;
  completed_pages: number;
  in_progress_pages: number;
}

interface ClassDeploymentsProps {
  deployments: Deployment[];
  isInstructor: boolean;
  onChatWithDeployment: (deploymentId: string, deploymentName: string) => void;
  onCodeWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onMCQWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onPromptWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onPageWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onDeleteDeployment: (deploymentId: string) => Promise<void>;
  onViewStudentChats: (deploymentId: string) => Promise<void>;
  onViewStudentSubmissions?: (deploymentId: string, deploymentName: string) => void;
  onViewStudentMCQ?: (deploymentId: string, deploymentName: string) => void;
  onViewStudentPrompts?: (deploymentId: string, deploymentName: string) => void;
  onViewStudentPages?: (deploymentId: string, deploymentName: string) => void;
  onAdminPageDeployment?: (deploymentId: string, deploymentName: string) => void;
  // Add new deployment handler props here as needed
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
const getDeploymentTypeConfig = (deploymentType: string): DeploymentTypeConfig => {
  return DEPLOYMENT_TYPES[deploymentType as keyof typeof DEPLOYMENT_TYPES] || DEPLOYMENT_TYPES.chat;
};

const getGradingMethods = () => ['problem_correct', 'test_cases_correct'];

// Helper function to check if configuration is a chat deployment configuration
const isChatConfiguration = (config: unknown): config is { provider: string; model: string; has_rag: boolean; mcp_enabled: boolean } => {
  return config !== null && typeof config === 'object' && 
         'provider' in config && typeof (config as Record<string, unknown>).provider === 'string' && 
         'model' in config && typeof (config as Record<string, unknown>).model === 'string';
};

// Helper function to extract question count for code deployments
const getCodeDeploymentQuestionCount = (deployment: Deployment): number => {
  if (!deployment.configuration) return 0;
  
  // Check if configuration has question_count property (code deployment)
  const config = deployment.configuration as Record<string, unknown>;
  if (typeof config.question_count === 'number') {
    return config.question_count;
  }
  
  return 0;
};

// Helper function to extract question count for MCQ deployments
const getMCQDeploymentQuestionCount = (deployment: Deployment): number => {
  if (!deployment.configuration) return 0;
  
  // Check if configuration has question_count property (MCQ deployment)
  const config = deployment.configuration as Record<string, unknown>;
  if (typeof config.question_count === 'number') {
    return config.question_count;
  }
  
  return 0;
};

// Helper function to get page count for page deployments
const getPageCount = (deployment: Deployment): string => {
  if (deployment.total_pages && typeof deployment.total_pages === 'number') {
    return String(deployment.total_pages);
  }
  
  // Fallback to configuration if total_pages is not available
  if (deployment.configuration) {
    const config = deployment.configuration as Record<string, unknown>;
    if (typeof config.page_count === 'number') {
      return String(config.page_count);
    }
  }
  
  return 'Multiple';
};

// Helper function to check if deployment is page-based
const isPageBasedDeployment = (deployment: Deployment, deploymentType: string): boolean => {
  if (deploymentType === 'page') return true;
  
  // Check the is_page_based field directly
  if (deployment.is_page_based === true) return true;
  
  // Fallback to configuration
  if (deployment.configuration && typeof deployment.configuration === 'object') {
    const config = deployment.configuration as Record<string, unknown>;
    return Boolean(config.is_page_based);
  }
  
  return false;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function ClassDeployments({ 
  deployments, 
  isInstructor,
  onChatWithDeployment,
  onCodeWithDeployment,
  onMCQWithDeployment,
  onPromptWithDeployment,
  onPageWithDeployment,
  onDeleteDeployment,
  onViewStudentChats,
  onViewStudentSubmissions,
  onViewStudentMCQ,
  onViewStudentPrompts,
  onViewStudentPages,
  onAdminPageDeployment
}: ClassDeploymentsProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deploymentTypes, setDeploymentTypes] = useState<Record<string,string>>({});
  const [deploymentStates, setDeploymentStates] = useState<Record<string, boolean>>({});
  const [togglingStates, setTogglingStates] = useState<Record<string, boolean>>({});
  const [individualGrades, setIndividualGrades] = useState<Record<string, IndividualGradesData>>({});
  const [loadingGrades, setLoadingGrades] = useState<Record<string, boolean>>({});
  const [buttonCustomizations, setButtonCustomizations] = useState<Record<string, {button_text: string; button_color: string}>>({});
  const [dueDates, setDueDates] = useState<Record<string, { due_date: string | null; is_overdue: boolean; days_until_due: number | null }>>({});
  const [pageProgress, setPageProgress] = useState<Record<string, PageProgressData>>({});

  const PAGE_PROGRESS_STYLES: Record<PageProgressStatus, { label: string; dot: string; text: string }> = {
    not_started: {
      label: 'Not started',
      dot: 'bg-blue-500',
      text: 'text-blue-700',
    },
    in_progress: {
      label: 'In progress',
      dot: 'bg-yellow-500',
      text: 'text-yellow-700',
    },
    completed: {
      label: 'Completed',
      dot: 'bg-green-500',
      text: 'text-green-700',
    },
  };

  // Sort deployments by most recent first
  const sortedDeployments = [...deployments].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Determine deployment types on mount / prop change
  useEffect(() => {
    const determineTypes = async () => {
      const types: Record<string,string> = {};
      const unknown: string[] = [];
      
      deployments.forEach(d => {
        // Check if this is a page-based deployment first
        if (d.is_page_based === true) {
          types[d.deployment_id] = "page";
        } else if (d.type) {
          types[d.deployment_id] = d.type;
        } else {
          unknown.push(d.deployment_id);
        }
      });
      
      if (unknown.length > 0) {
        await Promise.all(unknown.map(async id => {
          try { 
            const resp = await BaseDeploymentAPI.getDeploymentType(id); 
            types[id] = resp.type;
          } catch {
            types[id] = "chat";
          }
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

  // Fetch individual grades for deployments that support grading
  useEffect(() => {
    const fetchIndividualGrades = async () => {
      const gradedDeployments = deployments.filter(d => {
        const type = deploymentTypes[d.deployment_id] ?? d.type ?? 'chat';
        const typeConfig = getDeploymentTypeConfig(type);
        return typeConfig.hasGrading;
      });

      for (const deployment of gradedDeployments) {
        if (individualGrades[deployment.deployment_id]) continue; // Already loaded

        setLoadingGrades(prev => ({ ...prev, [deployment.deployment_id]: true }));
        
        try {
          const methods = getGradingMethods();
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

  // Fetch due dates for page-based deployments
  useEffect(() => {
    const fetchDueDates = async () => {
      if (Object.keys(deploymentTypes).length === 0) return;
      const updates: Record<string, { due_date: string | null; is_overdue: boolean; days_until_due: number | null }> = {};
      await Promise.all(
        deployments.map(async (d) => {
          const type = deploymentTypes[d.deployment_id] ?? d.type ?? 'chat';
          if (!(type === 'page' || isPageBasedDeployment(d, type))) return;
          if (dueDates[d.deployment_id]) return;
          try {
            const resp = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${d.deployment_id}/due-date`, { credentials: 'include' });
            if (resp.ok) {
              const data = await resp.json();
              updates[d.deployment_id] = {
                due_date: data?.due_date ?? null,
                is_overdue: Boolean(data?.is_overdue),
                days_until_due: data?.days_until_due ?? null,
              };
            }
          } catch {}
        })
      );
      if (Object.keys(updates).length > 0) setDueDates((prev) => ({ ...prev, ...updates }));
    };
    fetchDueDates();
  }, [deployments, deploymentTypes, dueDates]);

  // Fetch button customizations for page deployments when user is a student
  useEffect(() => {
    const fetchButtonCustomizations = async () => {
      if (isInstructor) return; // Only for students
      
      const pageDeployments = deployments.filter(d => {
        const type = deploymentTypes[d.deployment_id] ?? d.type ?? 'chat';
        return type === 'page' || isPageBasedDeployment(d, type);
      });

      for (const deployment of pageDeployments) {
        if (buttonCustomizations[deployment.deployment_id]) continue; // Already loaded

        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}/api/deploy/${deployment.deployment_id}/student-button`,
            { credentials: 'include' }
          );

          if (response.ok) {
            const data = await response.json();
            setButtonCustomizations(prev => ({
              ...prev,
              [deployment.deployment_id]: {
                button_text: data.button_text,
                button_color: data.button_color
              }
            }));
          }
        } catch (err) {
          console.warn(`Failed to fetch button customization for deployment ${deployment.deployment_id}:`, err);
        }
      }
    };

    // Only fetch if we have deployment types loaded
    if (Object.keys(deploymentTypes).length > 0) {
      fetchButtonCustomizations();
    }
  }, [deployments, deploymentTypes, buttonCustomizations, isInstructor]);

  // Fetch page progress for students
  useEffect(() => {
    if (isInstructor) return;

    const fetchPageProgress = async () => {
      const updates: Record<string, PageProgressData> = {};

      await Promise.all(
        deployments.map(async (deployment) => {
          const type = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
          if (!(type === 'page' || isPageBasedDeployment(deployment, type))) {
            return;
          }

          if (pageProgress[deployment.deployment_id]) {
            return;
          }

          try {
            const response = await fetch(
              `${API_CONFIG.BASE_URL}/api/deploy/${deployment.deployment_id}/pages/progress`,
              { credentials: 'include' }
            );

            if (!response.ok) {
              return;
            }

            const data = await response.json();
            updates[deployment.deployment_id] = {
              deployment_id: data.deployment_id,
              status: data.status as PageProgressStatus,
              required_pages: typeof data.required_pages === 'number' ? data.required_pages : 0,
              completed_pages: typeof data.completed_pages === 'number' ? data.completed_pages : 0,
              in_progress_pages: typeof data.in_progress_pages === 'number' ? data.in_progress_pages : 0,
            };
          } catch (err) {
            console.warn(`Failed to fetch page progress for deployment ${deployment.deployment_id}:`, err);
          }
        })
      );

      if (Object.keys(updates).length > 0) {
        setPageProgress((prev) => ({ ...prev, ...updates }));
      }
    };

    if (Object.keys(deploymentTypes).length > 0) {
      fetchPageProgress();
    }
  }, [deployments, deploymentTypes, isInstructor, pageProgress]);

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
    // Don't show grades for instructors
    if (isInstructor) return null;
    
    const deploymentType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
    const typeConfig = getDeploymentTypeConfig(deploymentType);
    
    if (!typeConfig.hasGrading) return null;

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

    // For students, show their individual grade
    const studentGrade = grades?.student_grades?.[0]; // Should be their own grade
    
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
      return (
        <></>
      );
    }
  };

  const renderPageProgress = (deployment: Deployment) => {
    if (isInstructor) return null;

    const deploymentType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
    if (!(deploymentType === 'page' || isPageBasedDeployment(deployment, deploymentType))) {
      return null;
    }

    const progress = pageProgress[deployment.deployment_id];

    if (!progress) {
      return (
        <div className="flex items-center space-x-1 text-xs text-gray-400">
          <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" />
          <span>Checking progress...</span>
        </div>
      );
    }

    const style = PAGE_PROGRESS_STYLES[progress.status] ?? PAGE_PROGRESS_STYLES.not_started;
    const hasRequirements = progress.required_pages > 0;

    return (
      <div className="flex items-center space-x-2">
        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
        {hasRequirements && (
          <span className="text-xs text-gray-500">
            {progress.completed_pages}/{progress.required_pages} required steps
          </span>
        )}
        {!hasRequirements && (
          <span className="text-xs text-gray-500">No required steps</span>
        )}
      </div>
    );
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
      {sortedDeployments.length === 0 ? (
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
          {sortedDeployments.map(deployment => {
            const isOpen = deploymentStates[deployment.deployment_id] ?? true;
            const isDisabled = !isOpen;
            const deploymentType = deploymentTypes[deployment.deployment_id] ?? deployment.type ?? 'chat';
            const typeConfig = getDeploymentTypeConfig(deploymentType);
            const IconComponent = typeConfig.icon;
            
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
                      <IconComponent className="h-4 w-4 mr-2" />
                      <h3 className="text-sm font-medium text-gray-900">
                        {deployment.workflow_name}
                      </h3>
                      <div className="flex items-center space-x-2">
                        {!isOpen && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Closed
                          </span>
                        )}
                      </div>
                    </div>
                  
                    <div className="mt-1 text-xs text-gray-500 space-y-1">
                      <div className={isDisabled ? 'opacity-60' : ''}>
                        {deploymentType === 'chat' && deployment.configuration && isChatConfiguration(deployment.configuration) && (
                          <>
                            <p>Model: {deployment.configuration.model}</p>
                            <p>Provider: {deployment.configuration.provider}</p>
                            <p>RAG: {deployment.configuration.has_rag ? 'Enabled' : 'Disabled'}</p>
                          </>
                        )}
                        {deploymentType === 'code' && (<p>Questions: {getCodeDeploymentQuestionCount(deployment)}</p>)}
                        {deploymentType === 'mcq' && (<p>Questions: {getMCQDeploymentQuestionCount(deployment)}</p>)}
                        {isPageBasedDeployment(deployment, deploymentType) && (
                          <>
                            <p>Pages: {getPageCount(deployment)}</p>
                          </>
                        )}
                        {/* Due date (bold) if present */}
                        {dueDates[deployment.deployment_id]?.due_date && (
                          <p>
                            <span className="text-gray-600">Due: </span>
                            <span className={`font-semibold ${dueDates[deployment.deployment_id]?.is_overdue ? 'text-red-600' : ''}`}>
                              {new Date(dueDates[deployment.deployment_id]!.due_date as string).toLocaleString(undefined, { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric', 
                                hour: 'numeric', 
                                minute: '2-digit'
                              })}
                            </span>
                          </p>
                        )}
                        <p>Deployed: {new Date(deployment.created_at).toLocaleDateString()}</p>
                        {renderPageProgress(deployment)}
                      </div>
                      {renderGradeDisplay(deployment)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {/* Student action button */}
                    <div className={isDisabled ? 'opacity-60' : ''}>
                      <button
                        onClick={() => {
                          if (isDisabled) return;
                          
                          // Use instructor-specific handler and properties if instructor and they exist
                          if (isInstructor && typeConfig.handleInstructorAction) {
                            typeConfig.handleInstructorAction({
                              onChatWithDeployment,
                              onCodeWithDeployment,
                              onMCQWithDeployment,
                              onPromptWithDeployment,
                              onPageWithDeployment,
                              onDeleteDeployment,
                              onViewStudentChats,
                              onViewStudentSubmissions,
                              onViewStudentMCQ,
                              onViewStudentPrompts,
                              onViewStudentPages,
                              onAdminPageDeployment,
                              deployments,
                              isInstructor
                            }, deployment);
                          } else {
                            typeConfig.handleDeploymentAction({
                              onChatWithDeployment,
                              onCodeWithDeployment,
                              onMCQWithDeployment,
                              onPromptWithDeployment,
                              onPageWithDeployment,
                              onDeleteDeployment,
                              onViewStudentChats,
                              onViewStudentSubmissions,
                              onViewStudentMCQ,
                              onViewStudentPrompts,
                              onViewStudentPages,
                              onAdminPageDeployment,
                              deployments,
                              isInstructor
                            }, deployment);
                          }
                        }}
                        disabled={isDisabled}
                        className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded ${
                          isDisabled 
                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                            : `text-white ${
                                // For students and page deployments, use custom button color if available
                                (!isInstructor && isPageBasedDeployment(deployment, deploymentType) && buttonCustomizations[deployment.deployment_id])
                                  ? buttonCustomizations[deployment.deployment_id].button_color
                                  : isInstructor && typeConfig.instructorButtonColor 
                                    ? typeConfig.instructorButtonColor 
                                    : typeConfig.buttonColor
                              }`
                        }`}
                        title={isDisabled ? 'Deployment is closed' : `${typeConfig.displayName}: ${
                          // For students and page deployments, use custom button text if available
                          (!isInstructor && isPageBasedDeployment(deployment, deploymentType) && buttonCustomizations[deployment.deployment_id])
                            ? buttonCustomizations[deployment.deployment_id].button_text
                            : isInstructor && typeConfig.instructorButtonText 
                              ? typeConfig.instructorButtonText 
                              : typeConfig.buttonText
                        }`}
                      >
                        {(() => {
                          const IconComponent = isInstructor && typeConfig.instructorIcon 
                            ? typeConfig.instructorIcon 
                            : typeConfig.icon;
                          return <IconComponent className="h-3 w-3 mr-1"/>;
                        })()}
                        {/* Use custom button text for students and page deployments */}
                        {(!isInstructor && isPageBasedDeployment(deployment, deploymentType) && buttonCustomizations[deployment.deployment_id])
                          ? buttonCustomizations[deployment.deployment_id].button_text
                          : isInstructor && typeConfig.instructorButtonText 
                            ? typeConfig.instructorButtonText 
                            : typeConfig.buttonText}
                      </button>
                    </div>
                    
                    {/* Instructor controls */}
                    {isInstructor && (
                      <>

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

                        {isPageBasedDeployment(deployment, deploymentType) && (
                          <button
                            onClick={() => {
                              // Use the original deployment action for viewing
                              if (onPageWithDeployment) {
                                onPageWithDeployment(deployment.deployment_id, deployment.workflow_name);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                            title="View Deployment"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 
