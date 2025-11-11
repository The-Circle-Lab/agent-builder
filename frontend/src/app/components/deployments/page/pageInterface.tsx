"use client";

import React from 'react';
import { PageInterfaceProps } from './types';
import { usePageDeployment } from './hooks';
import { PageHeader, PageContent } from './components';

export default function PageInterface({ deploymentId, deploymentName, onBack }: PageInterfaceProps) {
  const {
    pages,
    currentPage,
    currentPageInfo,
    pagesAccessible,
    loading,
    error,
    setCurrentPage,
    refreshPages,
  } = usePageDeployment(deploymentId);

  const handlePageComplete = () => {
    // Always return to assignments when user clicks "Return to Assignments"
    if (onBack) {
      onBack();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Page Header with Navigation */}
      <PageHeader
        pages={pages}
        currentPage={currentPage}
        deploymentName={deploymentName}
        pagesAccessible={pagesAccessible}
        onPageChange={setCurrentPage}
        onBack={onBack}
      />

      {/* Page Content */}
      <PageContent
        pageInfo={currentPageInfo}
        deploymentName={deploymentName}
        loading={loading}
        error={error}
        onPageComplete={handlePageComplete}
        onRefreshPages={refreshPages}
      />
    </div>
  );
} 
