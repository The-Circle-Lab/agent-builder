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
    loading,
    error,
    setCurrentPage,
  } = usePageDeployment(deploymentId);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Page Header with Navigation */}
      <PageHeader
        pages={pages}
        currentPage={currentPage}
        deploymentName={deploymentName}
        onPageChange={setCurrentPage}
        onBack={onBack}
      />

      {/* Page Content */}
      <PageContent
        pageInfo={currentPageInfo}
        deploymentName={deploymentName}
        loading={loading}
        error={error}
      />
    </div>
  );
} 
