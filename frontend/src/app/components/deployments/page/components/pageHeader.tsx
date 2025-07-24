"use client";

import React from 'react';
import { PageInfo } from '../types';
import { 
  ChatBubbleLeftRightIcon,
  RocketLaunchIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  DocumentIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

interface PageHeaderProps {
  pages: PageInfo[];
  currentPage: number;
  deploymentName: string;
  onPageChange: (pageNumber: number) => void;
  onBack?: () => void;
}

// Map deployment types to icons and colors
const getDeploymentTypeInfo = (type: string) => {
  switch (type) {
    case 'chat':
      return {
        icon: ChatBubbleLeftRightIcon,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        activeColor: 'bg-blue-600 text-white border-blue-600'
      };
    case 'code':
      return {
        icon: RocketLaunchIcon,
        color: 'bg-purple-100 text-purple-700 border-purple-200',
        activeColor: 'bg-purple-600 text-white border-purple-600'
      };
    case 'mcq':
      return {
        icon: ClipboardDocumentCheckIcon,
        color: 'bg-green-100 text-green-700 border-green-200',
        activeColor: 'bg-green-600 text-white border-green-600'
      };
    case 'prompt':
      return {
        icon: PencilSquareIcon,
        color: 'bg-orange-100 text-orange-700 border-orange-200',
        activeColor: 'bg-orange-600 text-white border-orange-600'
      };
    default:
      return {
        icon: DocumentIcon,
        color: 'bg-gray-100 text-gray-700 border-gray-200',
        activeColor: 'bg-gray-600 text-white border-gray-600'
      };
  }
};

export default function PageHeader({ pages, currentPage, deploymentName, onPageChange, onBack }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      {/* Header with Back Button and Title */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              title="Go back to deployments"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              <span className="font-medium">Back</span>
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{deploymentName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Multi-page workflow with {pages.length} page{pages.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Page Navigation Tabs */}
      <div className="flex space-x-1 overflow-x-auto">
        {pages.map((page) => {
          const typeInfo = getDeploymentTypeInfo(page.deployment_type);
          const IconComponent = typeInfo.icon;
          const isActive = page.page_number === currentPage;

          return (
            <button
              key={page.page_number}
              onClick={() => onPageChange(page.page_number)}
              className={`
                flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap
                ${isActive 
                  ? typeInfo.activeColor
                  : `${typeInfo.color} hover:bg-opacity-80`
                }
              `}
              title={`Page ${page.page_number} - ${page.deployment_type.toUpperCase()}`}
            >
              <IconComponent className="h-4 w-4" />
              <span className="font-medium">
                Page {page.page_number}
              </span>
              <span className={`
                text-xs px-2 py-0.5 rounded uppercase font-semibold
                ${isActive 
                  ? 'bg-white/20' 
                  : 'bg-black/10'
                }
              `}>
                {page.deployment_type}
              </span>
            </button>
          );
        })}
      </div>

      {/* Current Page Info */}
      {pages.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          Currently viewing: Page {currentPage} of {pages.length}
        </div>
      )}
    </div>
  );
} 
