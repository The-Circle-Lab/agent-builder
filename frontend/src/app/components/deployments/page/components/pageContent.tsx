"use client";

import React from "react";
import { PageInfo } from "../types";
import { ChatInterface } from "../../chat";
import { CodeInterface } from "../../code";
import { MCQInterface } from "../../mcq";
import { PromptInterface } from "../../prompt";
import VideoInterface from "../../video/videoInterface";

interface PageContentProps {
  pageInfo: PageInfo | null;
  deploymentName: string;
  loading: boolean;
  error: string | null;
}

export default function PageContent({
  pageInfo,
  deploymentName,
  loading,
  error,
}: PageContentProps) {
  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading page...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="bg-red-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Error Loading Page
          </h3>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No page selected
  if (!pageInfo) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="bg-gray-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto">
            <svg
              className="h-6 w-6 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No Page Selected
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Select a page from the navigation above to get started.
          </p>
        </div>
      </div>
    );
  }

  // Render the appropriate interface based on deployment type
  const renderInterface = () => {
    const pageDeploymentName = `${deploymentName} - Page ${pageInfo.page_number}`;

    switch (pageInfo.deployment_type) {
      case "chat":
        return (
          <ChatInterface
            deploymentId={pageInfo.deployment_id}
            workflowName={pageDeploymentName}
            embedded={true}
          />
        );

      case "code":
        return (
          <CodeInterface
            deploymentId={pageInfo.deployment_id}
            workflowName={pageDeploymentName}
            onBack={() => {}} // No-op since we're embedded in page
          />
        );

      case "mcq":
        return (
          <MCQInterface
            deploymentId={pageInfo.deployment_id}
            deploymentName={pageDeploymentName}
            onClose={() => {}} // No-op since we're embedded in page
          />
        );

      case "prompt":
        return (
          <PromptInterface
            deploymentId={pageInfo.deployment_id}
            deploymentName={pageDeploymentName}
            onClose={() => {}} // No-op since we're embedded in page
          />
        );

      case "video":
        return (
          <VideoInterface
            deploymentId={pageInfo.deployment_id}
            deploymentName={pageDeploymentName}
            onClose={() => {}}
          />
        );

      default:
        return (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="bg-yellow-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto">
                <svg
                  className="h-6 w-6 text-yellow-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                Unsupported Page Type
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Page type &quot;{pageInfo.deployment_type}&quot; is not
                supported yet.
              </p>
            </div>
          </div>
        );
    }
  };

  return <div className="flex-1 flex flex-col">{renderInterface()}</div>;
}
