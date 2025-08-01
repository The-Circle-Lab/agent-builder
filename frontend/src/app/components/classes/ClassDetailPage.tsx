"use client";

import React, { useState, useEffect } from "react";
import { Class, Workflow, Deployment } from "@/lib/types";
import { ClassAPI } from "./classAPI";
import ClassWorkflows from "./ClassWorkflows";
import ClassDeployments from "./ClassDeployments";
import ClassMembers from "./ClassMembers";
import JoinCodeModal from "./JoinCodeModal";
import StudentConversationsModal from "./StudentConversationsModal";
import StudentSubmissionsModal from "./StudentSubmissionsModal";
import StudentMCQModal from "./StudentMCQModal";
import StudentPromptsModal from "./StudentPromptsModal";
import StudentVideoProgressModal from "./StudentVideoProgressModal";
import { createWorkflowJSON } from "../agentBuilder/scripts/exportWorkflow";
import {
  ArrowLeftIcon,
  KeyIcon,
  BeakerIcon,
  UserGroupIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";

interface ClassDetailPageProps {
  classObj: Class;
  onBack: () => void;
  onEditWorkflow: (workflowId: number) => void;
  onChatWithDeployment: (deploymentId: string, deploymentName: string) => void;
  onCodeWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onMCQWithDeployment?: (deploymentId: string, deploymentName: string) => void;
  onPromptWithDeployment?: (
    deploymentId: string,
    deploymentName: string
  ) => void;
  onVideoWithDeployment?: (
    deploymentId: string,
    deploymentName: string
  ) => void;
  onPageWithDeployment?: (deploymentId: string, deploymentName: string) => void;
}

export default function ClassDetailPage({
  classObj,
  onBack,
  onEditWorkflow,
  onChatWithDeployment,
  onCodeWithDeployment,
  onMCQWithDeployment,
  onPromptWithDeployment,
  onVideoWithDeployment,
  onPageWithDeployment,
}: ClassDetailPageProps) {
  const isInstructor = classObj.user_role === "instructor";

  // Auto-navigate based on user role: instructors to workflows, students to deployments
  const [activeTab, setActiveTab] = useState<
    "workflows" | "deployments" | "members"
  >(isInstructor ? "workflows" : "deployments");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStudentChats, setShowStudentChats] = useState<{
    deploymentId: string;
    deploymentName: string;
  } | null>(null);
  const [showStudentSubmissions, setShowStudentSubmissions] = useState<{
    deploymentId: string;
    deploymentName: string;
  } | null>(null);
  const [showStudentMCQ, setShowStudentMCQ] = useState<{
    deploymentId: string;
    deploymentName: string;
  } | null>(null);
  const [showStudentPrompts, setShowStudentPrompts] = useState<{
    deploymentId: string;
    deploymentName: string;
  } | null>(null);
  const [showStudentVideoProgress, setShowStudentVideoProgress] = useState<{
    deploymentId: string;
    deploymentName: string;
  } | null>(null);

  const loadClassData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [classWorkflows, classDeployments] = await Promise.all([
        ClassAPI.getClassWorkflows(classObj.id),
        ClassAPI.getClassDeployments(),
      ]);

      setWorkflows(classWorkflows);
      setDeployments(classDeployments);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load class data"
      );
    } finally {
      setLoading(false);
    }
  }, [classObj.id]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  const handleCreateWorkflow = async (name: string, description?: string) => {
    try {
      const newWorkflow = await ClassAPI.createWorkflow(
        classObj.id,
        name,
        description
      );
      setWorkflows((prevWorkflows) => [...prevWorkflows, newWorkflow]);
      return newWorkflow;
    } catch (err) {
      throw err;
    }
  };

  const handleDeployWorkflow = async (workflow: Workflow) => {
    try {
      // Convert workflow data from saved format (nodes/edges) to deployment format (numbered nodes)
      let deploymentData = workflow.workflow_data;

      // Check if workflow_data is in the saved format (has nodes/edges)
      if (
        workflow.workflow_data &&
        workflow.workflow_data.nodes &&
        workflow.workflow_data.edges
      ) {
        try {
          // Convert from saved format to deployment format
          // Cast to unknown first then to the required type to avoid type conflicts
          const nodes = workflow.workflow_data.nodes as unknown as Parameters<
            typeof createWorkflowJSON
          >[0];
          const edges = workflow.workflow_data.edges as unknown as Parameters<
            typeof createWorkflowJSON
          >[1];
          const pageRelationships =
            (
              workflow.workflow_data as {
                pageRelationships?: Record<string, string[]>;
              }
            ).pageRelationships || {};
          const workflowJSON = createWorkflowJSON(
            nodes,
            edges,
            pageRelationships
          );
          deploymentData = JSON.parse(workflowJSON || "{}");
        } catch (conversionError) {
          console.error(
            "Failed to convert workflow data format:",
            conversionError
          );
          throw new Error(
            "Failed to prepare workflow for deployment. Please try editing and saving the workflow first."
          );
        }
      }

      const deployment = await ClassAPI.deployWorkflow(
        workflow.id,
        workflow.name,
        deploymentData || {}
      );
      await loadClassData(); // Reload to get the new deployment
      return deployment;
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteDeployment = async (deploymentId: string) => {
    try {
      await ClassAPI.deleteDeployment(deploymentId);
      setDeployments(
        deployments.filter((d) => d.deployment_id !== deploymentId)
      );
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteWorkflow = async (workflowId: number) => {
    try {
      await ClassAPI.deleteWorkflow(workflowId);
      setWorkflows(workflows.filter((w) => w.id !== workflowId));
    } catch (err) {
      throw err;
    }
  };

  const tabs = [
    {
      id: "workflows",
      label: "Workflows",
      icon: BeakerIcon,
      show: isInstructor,
    },
    {
      id: "deployments",
      label: "Deployments",
      icon: RocketLaunchIcon,
      show: true,
    },
    { id: "members", label: "Members", icon: UserGroupIcon, show: true },
  ].filter((tab) => tab.show);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 -ml-2 rounded-md hover:bg-gray-100"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {classObj.name}
                </h1>
                {classObj.description && (
                  <p className="text-sm text-gray-500">
                    {classObj.description}
                  </p>
                )}
              </div>
            </div>
            {isInstructor && (
              <button
                onClick={() => setShowJoinCode(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <KeyIcon className="h-4 w-4 mr-2" />
                Join Code
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveTab(
                      tab.id as "workflows" | "deployments" | "members"
                    )
                  }
                  className={`
                    flex items-center py-4 px-1 border-b-2 text-sm font-medium transition-colors
                    ${
                      activeTab === tab.id
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }
                  `}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadClassData}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {activeTab === "workflows" && isInstructor && (
              <ClassWorkflows
                workflows={workflows}
                onCreateWorkflow={handleCreateWorkflow}
                onEditWorkflow={onEditWorkflow}
                onDeployWorkflow={handleDeployWorkflow}
                onDeleteWorkflow={handleDeleteWorkflow}
              />
            )}
            {activeTab === "deployments" && (
              <ClassDeployments
                deployments={deployments}
                isInstructor={isInstructor}
                onChatWithDeployment={onChatWithDeployment}
                onDeleteDeployment={handleDeleteDeployment}
                onViewStudentChats={async (deploymentId) => {
                  const deployment = deployments.find(
                    (d) => d.deployment_id === deploymentId
                  );
                  if (deployment) {
                    setShowStudentChats({
                      deploymentId,
                      deploymentName: deployment.workflow_name,
                    });
                  }
                }}
                onViewStudentSubmissions={(deploymentId, deploymentName) => {
                  setShowStudentSubmissions({ deploymentId, deploymentName });
                }}
                onViewStudentMCQ={(deploymentId, deploymentName) => {
                  setShowStudentMCQ({ deploymentId, deploymentName });
                }}
                onViewStudentPrompts={(deploymentId, deploymentName) => {
                  setShowStudentPrompts({ deploymentId, deploymentName });
                }}
                onViewStudentVideoProgress={(deploymentId, deploymentName) => {
                  setShowStudentVideoProgress({ deploymentId, deploymentName });
                }}
                onCodeWithDeployment={onCodeWithDeployment}
                onMCQWithDeployment={onMCQWithDeployment}
                onPromptWithDeployment={onPromptWithDeployment}
                onVideoWithDeployment={onVideoWithDeployment}
                onPageWithDeployment={onPageWithDeployment}
              />
            )}
            {activeTab === "members" && (
              <ClassMembers
                classId={classObj.id}
                currentUserRole={classObj.user_role}
              />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {showJoinCode && (
        <JoinCodeModal
          classObj={classObj}
          onClose={() => setShowJoinCode(false)}
        />
      )}
      {showStudentChats && (
        <StudentConversationsModal
          deploymentId={showStudentChats.deploymentId}
          deploymentName={showStudentChats.deploymentName}
          onClose={() => setShowStudentChats(null)}
        />
      )}
      {showStudentSubmissions && (
        <StudentSubmissionsModal
          deploymentId={showStudentSubmissions.deploymentId}
          deploymentName={showStudentSubmissions.deploymentName}
          onClose={() => setShowStudentSubmissions(null)}
        />
      )}
      {showStudentMCQ && (
        <StudentMCQModal
          deploymentId={showStudentMCQ.deploymentId}
          deploymentName={showStudentMCQ.deploymentName}
          onClose={() => setShowStudentMCQ(null)}
        />
      )}
      {showStudentPrompts && (
        <StudentPromptsModal
          deploymentId={showStudentPrompts.deploymentId}
          deploymentName={showStudentPrompts.deploymentName}
          onClose={() => setShowStudentPrompts(null)}
        />
      )}
      {showStudentVideoProgress && (
        <StudentVideoProgressModal
          deploymentId={showStudentVideoProgress.deploymentId}
          deploymentName={showStudentVideoProgress.deploymentName}
          onClose={() => setShowStudentVideoProgress(null)}
        />
      )}
    </div>
  );
}
